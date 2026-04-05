// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  SkillSubnameRegistrar
/// @notice Registers `{skillname-slug}-{hash8}.skills.skillauditor.eth` ENS subnames
///         on behalf of SkillAuditor after each successful audit.
///
/// Architecture
/// ─────────────
/// After each audit stamp, the SkillAuditor API calls `registerSubname()` which:
///   1. Derives a human-readable label: `{slug}-{hash8}` (e.g. "github-pr-reviewer-7afc6af3")
///   2. Calls ENS Registry.setSubnodeRecord() to create/update the subname node
///   3. Calls the Public Resolver to set text records (verdict, score, audit_id, etc.)
///
/// Text record schema (ENSIP-5 / EIP-634)
/// ─────────────────────────────────────────
/// Key           Value
/// verdict       "safe" | "review_required" | "unsafe"
/// score         "0"–"100"
/// report_cid    IPFS CIDv1 of the full audit JSON
/// audited_at    Unix timestamp string
/// auditor       Auditor agent address
/// skill_name    Declared skill name from SKILL.md frontmatter
/// skill_hash    Full 0x-prefixed 32-byte skill content hash
/// audit_id      SkillAuditor audit UUID
/// base_tx_hash  txHash of the SkillRegistry stamp on Base Sepolia

/// @dev Minimal ENS Registry interface (ENSIP-1)
interface IENSRegistry {
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64  ttl
    ) external;

    function owner(bytes32 node) external view returns (address);
}

/// @dev Minimal ENS Public Resolver interface (ENSIP-5 text records)
interface IPublicResolver {
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

contract SkillSubnameRegistrar {
    // ─────────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────────

    IENSRegistry   public immutable ensRegistry;
    IPublicResolver public immutable publicResolver;

    /// @notice ENS namehash of the parent node (e.g. `skills.skillauditor.eth`).
    bytes32 public immutable skillsNode;

    /// @notice Human-readable parent ENS name (e.g. "skills.skillauditor.eth").
    string  public ensParentName;

    address public immutable skillRegistry;
    address public owner;
    address public auditorAgent;
    uint64  public constant DEFAULT_TTL = 0;

    /// @notice Maps skillHash → registered ENS name string (for off-chain lookups).
    mapping(bytes32 => string) public ensNames;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────────

    event SubnameRegistered(
        bytes32 indexed skillHash,
        bytes32 indexed subnameNode,
        string          ensName
    );
    event TextRecordsUpdated(bytes32 indexed subnameNode, string verdict, uint8 score);
    event AuditorAgentUpdated(address indexed previous, address indexed next);

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    error NotOwner();
    error NotAuthorized();
    error ZeroAddress();
    error ZeroHash();

    // ─────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────────

    constructor(
        address _ensRegistry,
        address _publicResolver,
        bytes32 _skillsNode,
        address _skillRegistry,
        address _owner,
        address _auditorAgent,
        string  memory _ensParentName
    ) {
        if (_ensRegistry    == address(0)) revert ZeroAddress();
        if (_publicResolver == address(0)) revert ZeroAddress();
        if (_skillRegistry  == address(0)) revert ZeroAddress();
        if (_owner          == address(0)) revert ZeroAddress();
        if (_auditorAgent   == address(0)) revert ZeroAddress();
        if (_skillsNode     == bytes32(0)) revert ZeroHash();

        ensRegistry    = IENSRegistry(_ensRegistry);
        publicResolver = IPublicResolver(_publicResolver);
        skillsNode     = _skillsNode;
        skillRegistry  = _skillRegistry;
        owner          = _owner;
        auditorAgent   = _auditorAgent;
        ensParentName  = _ensParentName;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuditor() {
        if (msg.sender != auditorAgent) revert NotAuthorized();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Primary action
    // ─────────────────────────────────────────────────────────────────────────────

    struct VerdictRecord {
        string verdict;     // "safe" | "review_required" | "unsafe"
        uint8  score;       // 0–100
        string reportCid;   // IPFS CIDv1
        string skillName;   // from SKILL.md frontmatter
        string auditor;     // auditor address or ENS name
        string auditId;     // SkillAuditor audit UUID
        string baseTxHash;  // txHash from SkillRegistry.recordStamp on Base Sepolia
    }

    /// @notice Register or update the ENS subname for a skill.
    /// @dev    If the subname already exists (re-audit), only text records are updated.
    function registerSubname(bytes32 skillHash, VerdictRecord calldata record)
        external
        onlyAuditor
        returns (bytes32 subnameNode, string memory ensName)
    {
        if (skillHash == bytes32(0)) revert ZeroHash();

        // Derive a human-readable label: {slug}-{hash8}
        string memory labelStr = _toLabelString(skillHash, record.skillName);
        bytes32       label    = keccak256(abi.encodePacked(labelStr));
        subnameNode            = _namehash(skillsNode, label);
        ensName                = string(abi.encodePacked(labelStr, ".", ensParentName));

        bool isNew = ensRegistry.owner(subnameNode) == address(0);

        if (isNew) {
            ensRegistry.setSubnodeRecord(
                skillsNode,
                label,
                address(this),
                address(publicResolver),
                DEFAULT_TTL
            );
            emit SubnameRegistered(skillHash, subnameNode, ensName);
        }

        _writeTextRecords(subnameNode, skillHash, record);
        ensNames[skillHash] = ensName;

        emit TextRecordsUpdated(subnameNode, record.verdict, record.score);
        return (subnameNode, ensName);
    }

    /// @notice Resolve text records for a given subname node.
    function resolveSkill(bytes32 subnameNode)
        external
        view
        returns (
            string memory verdict,
            string memory score,
            string memory reportCid,
            string memory auditedAt,
            string memory auditor,
            string memory skillName,
            string memory skillHash,
            string memory auditId,
            string memory baseTxHash
        )
    {
        verdict      = publicResolver.text(subnameNode, "verdict");
        score        = publicResolver.text(subnameNode, "score");
        reportCid    = publicResolver.text(subnameNode, "report_cid");
        auditedAt    = publicResolver.text(subnameNode, "audited_at");
        auditor      = publicResolver.text(subnameNode, "auditor");
        skillName    = publicResolver.text(subnameNode, "skill_name");
        skillHash    = publicResolver.text(subnameNode, "skill_hash");
        auditId      = publicResolver.text(subnameNode, "audit_id");
        baseTxHash   = publicResolver.text(subnameNode, "base_tx_hash");
    }

    /// @notice Look up the registered ENS name for a skill hash.
    function ensNameOf(bytes32 skillHash) external view returns (string memory) {
        return ensNames[skillHash];
    }

    /// @notice Compute the subname node for a given skill hash and skill name.
    function subnameNodeOf(bytes32 skillHash, string calldata skillName) external view returns (bytes32) {
        string memory labelStr = _toLabelString(skillHash, skillName);
        return _namehash(skillsNode, keccak256(abi.encodePacked(labelStr)));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Owner governance
    // ─────────────────────────────────────────────────────────────────────────────

    function setAuditorAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        emit AuditorAgentUpdated(auditorAgent, newAgent);
        auditorAgent = newAgent;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    function setEnsParentName(string calldata newName) external onlyOwner {
        ensParentName = newName;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────────

    function _writeTextRecords(
        bytes32 subnameNode,
        bytes32 skillHash,
        VerdictRecord calldata record
    ) internal {
        publicResolver.setText(subnameNode, "verdict",       record.verdict);
        publicResolver.setText(subnameNode, "score",         _uint8ToString(record.score));
        publicResolver.setText(subnameNode, "report_cid",    record.reportCid);
        publicResolver.setText(subnameNode, "audited_at",    _uint256ToString(block.timestamp));
        publicResolver.setText(subnameNode, "auditor",       record.auditor);
        publicResolver.setText(subnameNode, "skill_name",    record.skillName);
        publicResolver.setText(subnameNode, "skill_hash",    _bytes32ToHex(skillHash));
        publicResolver.setText(subnameNode, "audit_id",      record.auditId);
        publicResolver.setText(subnameNode, "base_tx_hash",  record.baseTxHash);
    }

    /// @dev ENS namehash: keccak256(parentNode || labelHash)
    function _namehash(bytes32 node, bytes32 labelHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(node, labelHash));
    }

    /// @dev Build label string: "{slug}-{hash8}" or just "{hash8}" if slug is empty.
    function _toLabelString(bytes32 skillHash, string memory skillName)
        internal pure returns (string memory)
    {
        string memory h8   = _toHex8(skillHash);
        string memory slug = _toSlug(skillName, 40);
        if (bytes(slug).length == 0) return h8;
        return string(abi.encodePacked(slug, "-", h8));
    }

    /// @dev Sanitize a skill name to a DNS-safe slug (lowercase, hyphens, max `maxLen` chars).
    function _toSlug(string memory s, uint256 maxLen) internal pure returns (string memory) {
        bytes memory src    = bytes(s);
        bytes memory result = new bytes(maxLen);
        uint256 j           = 0;
        bool    lastDash    = false;

        for (uint256 i = 0; i < src.length && j < maxLen; i++) {
            uint8 c = uint8(src[i]);
            if (c >= 65 && c <= 90) {
                // A-Z → lowercase
                result[j++] = bytes1(c + 32);
                lastDash = false;
            } else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
                // a-z, 0-9 — keep as-is
                result[j++] = bytes1(c);
                lastDash = false;
            } else if (j > 0 && !lastDash) {
                // Any other char → hyphen (collapse runs)
                result[j++] = '-';
                lastDash = true;
            }
        }

        // Trim trailing hyphen
        if (j > 0 && result[j - 1] == '-') j--;

        bytes memory trimmed = new bytes(j);
        for (uint256 i = 0; i < j; i++) trimmed[i] = result[i];
        return string(trimmed);
    }

    /// @dev First 8 hex chars of a bytes32 (no 0x prefix).
    function _toHex8(bytes32 b) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result   = new bytes(8);
        for (uint256 i = 0; i < 4; i++) {
            result[i * 2]     = hexChars[uint8(b[i]) >> 4];
            result[i * 2 + 1] = hexChars[uint8(b[i]) & 0x0f];
        }
        return string(result);
    }

    /// @dev Full 64-char hex of bytes32 with "0x" prefix.
    function _bytes32ToHex(bytes32 b) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result   = new bytes(66);
        result[0] = "0";
        result[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            result[2 + i * 2]     = hexChars[uint8(b[i]) >> 4];
            result[2 + i * 2 + 1] = hexChars[uint8(b[i]) & 0x0f];
        }
        return string(result);
    }

    function _uint8ToString(uint8 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint8 temp = v; uint8 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        return string(buf);
    }

    function _uint256ToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v; uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        return string(buf);
    }
}
