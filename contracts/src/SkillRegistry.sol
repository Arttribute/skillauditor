// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  SkillRegistry
/// @notice Immutable, permissionless onchain registry of audited Claude SKILL.md files.
///
/// Architecture
/// ─────────────
/// This contract is intentionally minimal and stable. It is the single onchain anchor
/// for the SkillAuditor ecosystem. All other modules (ENS subnames, AgentKit wallet,
/// Ledger Clear Signing, World ID, x402 payments) are additive layers that either:
///   a) read from this contract via getStamp() / isVerified(), or
///   b) are wired in by calling setAuditorAgent() / updateEnsNode() — no redeployment needed.
///
/// Modular extension path
/// ───────────────────────
///   Step 1  Deploy this contract (dev key as auditorAgent)          ← NOW
///   Step 2  Wire IPFS: reportCid goes from 0x0 to real content hash
///   Step 3  Wire World ID: nullifier dedup stays in MongoDB (server-side)
///   Step 4  Wire AgentKit: call setAuditorAgent(agentKitWalletAddress)
///   Step 5  Deploy SkillSubnameRegistrar, call updateEnsNode() after each stamp
///   Step 6  Add Ledger ERC-7730 JSON metadata (no contract change at all)
///
/// Stamp struct
/// ─────────────
/// All forward-compatibility fields are pre-allocated so the struct never changes:
///   ensNode   — 0x0 until ENS module registers the subname (owner backfills via updateEnsNode)
///   metadata  — reserved for World ID verification level, AgentKit session ID, etc.

contract SkillRegistry {
    // ─────────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Verdict values stored as uint8 to minimise gas.
    uint8 public constant VERDICT_UNSAFE          = 0;
    uint8 public constant VERDICT_REVIEW_REQUIRED = 1;
    uint8 public constant VERDICT_SAFE            = 2;

    /// @dev Full audit stamp for a SKILL.md file, identified by SHA-256 content hash.
    struct AuditStamp {
        address auditorAddress; // address that called recordStamp()
        uint8   verdict;        // 0=unsafe  1=review_required  2=safe
        uint8   score;          // 0–100 safety score
        uint64  timestamp;      // unix seconds at stamp time
        bytes32 reportCid;      // sha256 digest of the IPFS audit report
                                //   derive from CIDv1: strip the 0x1220 multihash prefix
                                //   empty (0x0) until IPFS module is live
        bytes32 ensNode;        // ENS namehash of {hash8}.skills.auditor.eth
                                //   empty (0x0) until ENS module is live
                                //   backfilled via updateEnsNode() after subname registered
        bytes32 metadata;       // reserved — World ID level, AgentKit session ID, etc.
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Address authorised to write audit stamps. Swapped to AgentKit wallet in Step 4.
    address public auditorAgent;

    /// @notice Contract owner — can rotate auditorAgent and pause the registry.
    address public owner;

    /// @notice Pauses all stamp writes (emergency circuit breaker).
    bool public paused;

    /// @notice Primary registry: skillHash (SHA-256 as bytes32) → AuditStamp.
    mapping(bytes32 => AuditStamp) private _stamps;

    /// @notice Track which hashes have been stamped (for enumeration / events).
    bytes32[] private _stampedHashes;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new audit stamp is recorded.
    /// @dev SkillSubnameRegistrar listens to this event to trigger ENS registration.
    event SkillAudited(
        bytes32 indexed skillHash,
        address indexed auditor,
        uint8           verdict,
        uint8           score,
        uint64          timestamp
    );

    /// @notice Emitted when an existing stamp's ENS node is backfilled.
    event EnsNodeUpdated(bytes32 indexed skillHash, bytes32 ensNode);

    /// @notice Emitted when the authorised auditor agent is rotated.
    event AuditorAgentUpdated(address indexed previous, address indexed next);

    /// @notice Emitted when a stamp is revoked (e.g. skill modified post-audit).
    event StampRevoked(bytes32 indexed skillHash, address indexed revokedBy);

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    error NotAuthorized();
    error NotOwner();
    error RegistryPaused();
    error InvalidScore();
    error InvalidVerdict();
    error ZeroHash();
    error ZeroAddress();
    error StampNotFound();

    // ─────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────────

    /// @param _owner         Multisig or deployer EOA — controls agent rotation + pause.
    /// @param _auditorAgent  Initial signing address (dev key; rotated to AgentKit in Step 4).
    constructor(address _owner, address _auditorAgent) {
        if (_owner == address(0) || _auditorAgent == address(0)) revert ZeroAddress();
        owner        = _owner;
        auditorAgent = _auditorAgent;
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

    modifier whenNotPaused() {
        if (paused) revert RegistryPaused();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Write — auditorAgent only
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Record an audit stamp for a skill.
    /// @dev    Called by the SkillAuditor API after the four-stage pipeline completes.
    ///         Overwrites a previous stamp if the skill was re-audited.
    /// @param skillHash  SHA-256 of the raw SKILL.md content as bytes32.
    /// @param verdict    0=unsafe  1=review_required  2=safe
    /// @param score      Safety score 0–100.
    /// @param reportCid  SHA-256 of the IPFS report JSON (strip 0x1220 prefix from CIDv1).
    ///                   Pass bytes32(0) if IPFS module not yet live.
    function recordStamp(
        bytes32 skillHash,
        uint8   verdict,
        uint8   score,
        bytes32 reportCid
    ) external onlyAuditor whenNotPaused {
        if (skillHash == bytes32(0))  revert ZeroHash();
        if (verdict   >  2)           revert InvalidVerdict();
        if (score     >  100)         revert InvalidScore();

        bool isNew = _stamps[skillHash].timestamp == 0;

        _stamps[skillHash] = AuditStamp({
            auditorAddress: msg.sender,
            verdict:        verdict,
            score:          score,
            timestamp:      uint64(block.timestamp),
            reportCid:      reportCid,
            ensNode:        _stamps[skillHash].ensNode, // preserve existing ensNode on re-audit
            metadata:       bytes32(0)
        });

        if (isNew) {
            _stampedHashes.push(skillHash);
        }

        emit SkillAudited(skillHash, msg.sender, verdict, score, uint64(block.timestamp));
    }

    /// @notice Backfill the ENS node for a stamp after the ENS module registers the subname.
    /// @dev    Called by the SkillSubnameRegistrar (or owner directly) after Step 5.
    ///         Does not re-emit SkillAudited — only emits EnsNodeUpdated.
    function updateEnsNode(bytes32 skillHash, bytes32 ensNode) external onlyAuditor {
        if (_stamps[skillHash].timestamp == 0) revert StampNotFound();
        _stamps[skillHash].ensNode = ensNode;
        emit EnsNodeUpdated(skillHash, ensNode);
    }

    /// @notice Revoke a stamp (e.g. skill modified post-audit, hash no longer matches).
    /// @dev    Sets verdict to UNSAFE and score to 0, keeps audit trail via event.
    function revokeStamp(bytes32 skillHash) external onlyAuditor {
        if (_stamps[skillHash].timestamp == 0) revert StampNotFound();
        _stamps[skillHash].verdict = VERDICT_UNSAFE;
        _stamps[skillHash].score   = 0;
        emit StampRevoked(skillHash, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Read — permissionless
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Returns the full audit stamp for a skill hash.
    /// @dev    Returns a zero-value struct if the skill has never been stamped.
    function getStamp(bytes32 skillHash) external view returns (AuditStamp memory) {
        return _stamps[skillHash];
    }

    /// @notice The one-line agent integration: check if a skill is safe to load.
    /// @dev    Returns true only if: verdict == safe AND score >= 70 AND not revoked.
    ///         Downstream agents call this before loading any SKILL.md.
    function isVerified(bytes32 skillHash) external view returns (bool) {
        AuditStamp storage s = _stamps[skillHash];
        return s.verdict == VERDICT_SAFE && s.score >= 70;
    }

    /// @notice Returns true if a stamp exists for the given hash (any verdict).
    function hasStamp(bytes32 skillHash) external view returns (bool) {
        return _stamps[skillHash].timestamp > 0;
    }

    /// @notice Total number of unique skills ever stamped.
    function totalStamped() external view returns (uint256) {
        return _stampedHashes.length;
    }

    /// @notice Returns a page of stamped skill hashes for enumeration.
    /// @param offset  Zero-based start index.
    /// @param limit   Maximum entries to return (capped at 100).
    function getStampedHashes(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory)
    {
        uint256 total  = _stampedHashes.length;
        if (offset >= total) return new bytes32[](0);

        uint256 cap    = limit > 100 ? 100 : limit;
        uint256 end    = offset + cap;
        if (end > total) end = total;

        bytes32[] memory page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _stampedHashes[i];
        }
        return page;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Owner — governance
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Rotate the authorised auditor agent.
    /// @dev    Step 4: call this to swap the dev key for the AgentKit CDP wallet.
    function setAuditorAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        emit AuditorAgentUpdated(auditorAgent, newAgent);
        auditorAgent = newAgent;
    }

    /// @notice Transfer contract ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    /// @notice Emergency circuit breaker — pauses all stamp writes.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }
}
