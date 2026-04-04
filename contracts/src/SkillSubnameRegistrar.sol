// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  SkillSubnameRegistrar
/// @notice Registers `{hash8}.skills.auditor.eth` ENS subnames on behalf of SkillAuditor.
///
/// Architecture
/// ─────────────
/// This contract is deployed alongside SkillRegistry and given ownership of the
/// `skills.auditor.eth` ENS node. After each successful audit stamp, the SkillAuditor
/// API calls `registerSubname()` which:
///   1. Calls ENS Registry.setSubnodeRecord() to create the subname node
///   2. Calls the Public Resolver to set text records (verdict, score, etc.)
///
/// ENS interface compatibility
/// ────────────────────────────
/// Uses standard ENS interfaces (ENSIP-1). Compatible with:
///   - L1 Ethereum mainnet/sepolia (0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e)
///   - Any chain where ENS-compatible contracts are deployed (e.g. Base via Basenames)
///
/// Subname format
/// ────────────────
/// `{skillHash[0:8]}.skills.auditor.eth`
/// where skillHash[0:8] is the first 8 hex characters of the 32-byte SHA-256 skill content hash
///
/// Text record schema (ENSIP-5 / EIP-634)
/// ─────────────────────────────────────────
/// Key           Value
/// verdict       "safe" | "review_required" | "unsafe"
/// score         "0"–"100"
/// report_cid    IPFS CIDv1 of the full audit JSON (empty if IPFS not wired)
/// audited_at    Unix timestamp string
/// auditor       Auditor agent ENS name or address
/// skill_name    Declared skill name from SKILL.md frontmatter
/// skill_hash    Full 0x-prefixed 32-byte skill content hash

/// @dev Minimal ENS Registry interface (ENSIP-1)
interface IENSRegistry {
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64  ttl
    ) external;

    function setSubnodeOwner(
        bytes32 node,
        bytes32 label,
        address owner
    ) external returns (bytes32);

    function owner(bytes32 node) external view returns (address);

    function resolver(bytes32 node) external view returns (address);
}

/// @dev Minimal ENS Public Resolver interface (ENSIP-5 text records)
interface IPublicResolver {
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function setAddr(bytes32 node, address addr) external;
    function text(bytes32 node, string calldata key) external view returns (string memory);
    function addr(bytes32 node) external view returns (address);
}

contract SkillSubnameRegistrar {
    // ─────────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice ENS registry contract.
    IENSRegistry public immutable ensRegistry;

    /// @notice ENS public resolver contract used for all registered subnames.
    IPublicResolver public immutable publicResolver;

    /// @notice ENS namehash of `skills.auditor.eth` — the parent node this contract manages.
    bytes32 public immutable skillsNode;

    /// @notice SkillRegistry contract that emits SkillAudited events.
    address public immutable skillRegistry;

    /// @notice Contract owner — can rotate authorised caller.
    address public owner;

    /// @notice Address authorised to call registerSubname() and updateTextRecords().
    ///         Set to the auditorAgent (SkillAuditor API backend).
    address public auditorAgent;

    /// @notice Default TTL applied to all registered subnames.
    uint64 public constant DEFAULT_TTL = 0;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a skill subname is registered for the first time.
    event SubnameRegistered(
        bytes32 indexed skillHash,
        bytes32 indexed subnameNode,
        string          ensName
    );

    /// @notice Emitted when text records are updated (e.g. re-audit).
    event TextRecordsUpdated(bytes32 indexed subnameNode, string verdict, uint8 score);

    /// @notice Emitted when the authorised agent is rotated.
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

    /// @param _ensRegistry     ENS Registry contract address.
    /// @param _publicResolver  ENS Public Resolver contract address.
    /// @param _skillsNode      ENS namehash of `skills.auditor.eth`.
    ///                         Compute off-chain: `namehash("skills.auditor.eth")`
    /// @param _skillRegistry   SkillRegistry contract address (for reference; not called here).
    /// @param _owner           Owner address (can rotate auditorAgent).
    /// @param _auditorAgent    Address authorised to register subnames.
    constructor(
        address _ensRegistry,
        address _publicResolver,
        bytes32 _skillsNode,
        address _skillRegistry,
        address _owner,
        address _auditorAgent
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
    // Primary action — called by SkillAuditor API after stamp is confirmed
    // ─────────────────────────────────────────────────────────────────────────────

    struct VerdictRecord {
        string verdict;    // "safe" | "review_required" | "unsafe"
        uint8  score;      // 0–100
        string reportCid;  // IPFS CIDv1 (empty if IPFS not wired)
        string skillName;  // from SKILL.md frontmatter
        string auditor;    // auditor ENS name or address string
    }

    /// @notice Register or update the ENS subname for a skill.
    /// @dev    If the subname already exists (re-audit), only text records are updated.
    ///         Caller must be the authorised auditorAgent.
    /// @param  skillHash  Full 32-byte SHA-256 content hash (same as SkillRegistry key).
    /// @param  record     Verdict data to write into ENS text records.
    /// @return subnameNode  The ENS namehash of the registered subname.
    /// @return ensName      The human-readable ENS name (e.g. "a1b2c3d4.skills.auditor.eth").
    function registerSubname(bytes32 skillHash, VerdictRecord calldata record)
        external
        onlyAuditor
        returns (bytes32 subnameNode, string memory ensName)
    {
        if (skillHash == bytes32(0)) revert ZeroHash();

        // Derive label from first 8 hex chars of the skillHash (without 0x prefix)
        bytes32 label    = _labelHash(skillHash);
        subnameNode      = _namehash(skillsNode, label);
        string memory h8 = _toHex8(skillHash);
        ensName          = string(abi.encodePacked(h8, ".skills.auditor.eth"));

        bool isNew = ensRegistry.owner(subnameNode) == address(0);

        if (isNew) {
            // Create the subnode, set this contract as owner, point to public resolver
            ensRegistry.setSubnodeRecord(
                skillsNode,
                label,
                address(this), // owner — can be transferred later
                address(publicResolver),
                DEFAULT_TTL
            );
            emit SubnameRegistered(skillHash, subnameNode, ensName);
        }

        // Write / overwrite text records (idempotent on re-audit)
        _writeTextRecords(subnameNode, skillHash, record);

        emit TextRecordsUpdated(subnameNode, record.verdict, record.score);
        return (subnameNode, ensName);
    }

    /// @notice Resolve text records for a given subname node.
    /// @dev    Permissionless read — anyone can call this to verify a skill.
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
            string memory skillHash
        )
    {
        verdict   = publicResolver.text(subnameNode, "verdict");
        score     = publicResolver.text(subnameNode, "score");
        reportCid = publicResolver.text(subnameNode, "report_cid");
        auditedAt = publicResolver.text(subnameNode, "audited_at");
        auditor   = publicResolver.text(subnameNode, "auditor");
        skillName = publicResolver.text(subnameNode, "skill_name");
        skillHash = publicResolver.text(subnameNode, "skill_hash");
    }

    /// @notice Compute the subname node for a given skill hash (off-chain helper).
    function subnameNodeOf(bytes32 skillHash) external view returns (bytes32) {
        return _namehash(skillsNode, _labelHash(skillHash));
    }

    /// @notice Compute the ENS name string for a given skill hash.
    function ensNameOf(bytes32 skillHash) external pure returns (string memory) {
        return string(abi.encodePacked(_toHex8(skillHash), ".skills.auditor.eth"));
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

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────────

    /// @dev Write all ENSIP-5 text records for a subname node.
    function _writeTextRecords(
        bytes32 subnameNode,
        bytes32 skillHash,
        VerdictRecord calldata record
    ) internal {
        publicResolver.setText(subnameNode, "verdict",    record.verdict);
        publicResolver.setText(subnameNode, "score",      _uint8ToString(record.score));
        publicResolver.setText(subnameNode, "report_cid", record.reportCid);
        publicResolver.setText(subnameNode, "audited_at", _uint256ToString(block.timestamp));
        publicResolver.setText(subnameNode, "auditor",    record.auditor);
        publicResolver.setText(subnameNode, "skill_name", record.skillName);
        publicResolver.setText(subnameNode, "skill_hash", _bytes32ToHex(skillHash));
    }

    /// @dev ENS namehash: keccak256(parentNode || keccak256(label))
    function _namehash(bytes32 node, bytes32 labelHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(node, labelHash));
    }

    /// @dev Label hash: keccak256 of the 8-char hex string derived from skillHash.
    ///      This makes the label human-readable in ENS (e.g. "a1b2c3d4").
    function _labelHash(bytes32 skillHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_toHex8(skillHash)));
    }

    /// @dev Returns the first 8 hex chars of a bytes32 (without "0x" prefix).
    function _toHex8(bytes32 b) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result = new bytes(8);
        for (uint256 i = 0; i < 4; i++) {
            result[i * 2]     = hexChars[uint8(b[i]) >> 4];
            result[i * 2 + 1] = hexChars[uint8(b[i]) & 0x0f];
        }
        return string(result);
    }

    /// @dev Returns the full 64-char hex representation of a bytes32 with "0x" prefix.
    function _bytes32ToHex(bytes32 b) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result = new bytes(66);
        result[0] = "0";
        result[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            result[2 + i * 2]     = hexChars[uint8(b[i]) >> 4];
            result[2 + i * 2 + 1] = hexChars[uint8(b[i]) & 0x0f];
        }
        return string(result);
    }

    /// @dev Converts a uint8 to its decimal string representation.
    function _uint8ToString(uint8 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint8 temp = v;
        uint8 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }

    /// @dev Converts a uint256 to its decimal string representation.
    function _uint256ToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }
}
