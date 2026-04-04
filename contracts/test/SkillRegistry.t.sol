// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SkillRegistry.sol";

/// @notice Comprehensive test suite for SkillRegistry.
///         Run: forge test -vvv --gas-report
contract SkillRegistryTest is Test {
    SkillRegistry public registry;

    address owner       = makeAddr("owner");
    address auditor     = makeAddr("auditor");
    address stranger    = makeAddr("stranger");
    address newAgent    = makeAddr("newAgent");

    // Sample skill hash — SHA-256("test skill content") as bytes32
    bytes32 constant HASH_A = keccak256("skill_a");
    bytes32 constant HASH_B = keccak256("skill_b");
    bytes32 constant HASH_C = keccak256("skill_c");

    bytes32 constant REPORT_CID  = keccak256("ipfs_report_cid");
    bytes32 constant ENS_NODE_A  = keccak256("hash8a.skills.auditor.eth");

    // ─────────────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────────────

    function setUp() public {
        registry = new SkillRegistry(owner, auditor);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────────

    function test_constructor_setsOwnerAndAgent() public view {
        assertEq(registry.owner(),        owner);
        assertEq(registry.auditorAgent(), auditor);
        assertFalse(registry.paused());
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(SkillRegistry.ZeroAddress.selector);
        new SkillRegistry(address(0), auditor);
    }

    function test_constructor_revertsOnZeroAgent() public {
        vm.expectRevert(SkillRegistry.ZeroAddress.selector);
        new SkillRegistry(owner, address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // recordStamp — happy path
    // ─────────────────────────────────────────────────────────────────────────────

    function test_recordStamp_safe() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);

        SkillRegistry.AuditStamp memory s = registry.getStamp(HASH_A);
        assertEq(s.auditorAddress, auditor);
        assertEq(s.verdict,        2);
        assertEq(s.score,          85);
        assertEq(s.reportCid,      REPORT_CID);
        assertEq(s.ensNode,        bytes32(0)); // not set yet
        assertGt(s.timestamp,      0);
    }

    function test_recordStamp_reviewRequired() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 1, 55, bytes32(0));

        SkillRegistry.AuditStamp memory s = registry.getStamp(HASH_A);
        assertEq(s.verdict, 1);
        assertEq(s.score,   55);
    }

    function test_recordStamp_unsafe() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 0, 10, bytes32(0));

        SkillRegistry.AuditStamp memory s = registry.getStamp(HASH_A);
        assertEq(s.verdict, 0);
        assertEq(s.score,   10);
    }

    function test_recordStamp_emitsEvent() public {
        vm.prank(auditor);
        vm.expectEmit(true, true, false, true);
        emit SkillRegistry.SkillAudited(HASH_A, auditor, 2, 90, uint64(block.timestamp));
        registry.recordStamp(HASH_A, 2, 90, REPORT_CID);
    }

    function test_recordStamp_incrementsTotalStamped() public {
        assertEq(registry.totalStamped(), 0);

        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
        assertEq(registry.totalStamped(), 1);

        registry.recordStamp(HASH_B, 1, 60, bytes32(0));
        assertEq(registry.totalStamped(), 2);
        vm.stopPrank();
    }

    function test_recordStamp_reaudit_doesNotDuplicateCount() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
        registry.recordStamp(HASH_A, 1, 55, REPORT_CID); // re-audit same skill
        vm.stopPrank();

        assertEq(registry.totalStamped(), 1); // still 1 unique skill
    }

    function test_recordStamp_reaudit_preservesEnsNode() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);
        registry.updateEnsNode(HASH_A, ENS_NODE_A);

        // Re-audit the same skill
        registry.recordStamp(HASH_A, 2, 90, REPORT_CID);
        vm.stopPrank();

        // ENS node should be preserved
        assertEq(registry.getStamp(HASH_A).ensNode, ENS_NODE_A);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // recordStamp — reverts
    // ─────────────────────────────────────────────────────────────────────────────

    function test_recordStamp_revertsIfNotAuditor() public {
        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotAuthorized.selector);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
    }

    function test_recordStamp_revertsOnZeroHash() public {
        vm.prank(auditor);
        vm.expectRevert(SkillRegistry.ZeroHash.selector);
        registry.recordStamp(bytes32(0), 2, 80, REPORT_CID);
    }

    function test_recordStamp_revertsOnInvalidVerdict() public {
        vm.prank(auditor);
        vm.expectRevert(SkillRegistry.InvalidVerdict.selector);
        registry.recordStamp(HASH_A, 3, 80, REPORT_CID); // verdict 3 is invalid
    }

    function test_recordStamp_revertsOnScoreAbove100() public {
        vm.prank(auditor);
        vm.expectRevert(SkillRegistry.InvalidScore.selector);
        registry.recordStamp(HASH_A, 2, 101, REPORT_CID);
    }

    function test_recordStamp_revertsWhenPaused() public {
        vm.prank(owner);
        registry.setPaused(true);

        vm.prank(auditor);
        vm.expectRevert(SkillRegistry.RegistryPaused.selector);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // isVerified
    // ─────────────────────────────────────────────────────────────────────────────

    function test_isVerified_trueForSafeHighScore() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 70, REPORT_CID); // verdict=safe, score=70
        assertTrue(registry.isVerified(HASH_A));
    }

    function test_isVerified_trueAtScoreThreshold() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 70, REPORT_CID); // exactly at threshold
        assertTrue(registry.isVerified(HASH_A));
    }

    function test_isVerified_falseForSafeLowScore() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 69, REPORT_CID); // safe but score < 70
        assertFalse(registry.isVerified(HASH_A));
    }

    function test_isVerified_falseForReviewRequired() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 1, 80, REPORT_CID);
        assertFalse(registry.isVerified(HASH_A));
    }

    function test_isVerified_falseForUnsafe() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 0, 5, REPORT_CID);
        assertFalse(registry.isVerified(HASH_A));
    }

    function test_isVerified_falseForUnknownHash() public view {
        assertFalse(registry.isVerified(keccak256("unknown")));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // hasStamp
    // ─────────────────────────────────────────────────────────────────────────────

    function test_hasStamp_falseBeforeRecord() public view {
        assertFalse(registry.hasStamp(HASH_A));
    }

    function test_hasStamp_trueAfterRecord() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
        assertTrue(registry.hasStamp(HASH_A));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // updateEnsNode
    // ─────────────────────────────────────────────────────────────────────────────

    function test_updateEnsNode_setsNode() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);
        registry.updateEnsNode(HASH_A, ENS_NODE_A);
        vm.stopPrank();

        assertEq(registry.getStamp(HASH_A).ensNode, ENS_NODE_A);
    }

    function test_updateEnsNode_emitsEvent() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);

        vm.expectEmit(true, false, false, true);
        emit SkillRegistry.EnsNodeUpdated(HASH_A, ENS_NODE_A);
        registry.updateEnsNode(HASH_A, ENS_NODE_A);
        vm.stopPrank();
    }

    function test_updateEnsNode_revertsIfNotAuditor() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);

        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotAuthorized.selector);
        registry.updateEnsNode(HASH_A, ENS_NODE_A);
    }

    function test_updateEnsNode_revertsIfNoStamp() public {
        vm.prank(auditor);
        vm.expectRevert(SkillRegistry.StampNotFound.selector);
        registry.updateEnsNode(HASH_A, ENS_NODE_A);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // revokeStamp
    // ─────────────────────────────────────────────────────────────────────────────

    function test_revokeStamp_setsUnsafeAndZeroScore() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);
        registry.revokeStamp(HASH_A);
        vm.stopPrank();

        SkillRegistry.AuditStamp memory s = registry.getStamp(HASH_A);
        assertEq(s.verdict, 0); // UNSAFE
        assertEq(s.score,   0);
        assertFalse(registry.isVerified(HASH_A));
    }

    function test_revokeStamp_emitsEvent() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);

        vm.expectEmit(true, true, false, false);
        emit SkillRegistry.StampRevoked(HASH_A, auditor);
        registry.revokeStamp(HASH_A);
        vm.stopPrank();
    }

    function test_revokeStamp_revertsIfNotAuditor() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 85, REPORT_CID);

        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotAuthorized.selector);
        registry.revokeStamp(HASH_A);
    }

    function test_revokeStamp_revertsIfNoStamp() public {
        vm.prank(auditor);
        vm.expectRevert(SkillRegistry.StampNotFound.selector);
        registry.revokeStamp(HASH_A);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // getStampedHashes pagination
    // ─────────────────────────────────────────────────────────────────────────────

    function test_getStampedHashes_emptyRegistry() public view {
        bytes32[] memory hashes = registry.getStampedHashes(0, 10);
        assertEq(hashes.length, 0);
    }

    function test_getStampedHashes_allEntries() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
        registry.recordStamp(HASH_B, 1, 55, bytes32(0));
        registry.recordStamp(HASH_C, 0, 10, bytes32(0));
        vm.stopPrank();

        bytes32[] memory hashes = registry.getStampedHashes(0, 10);
        assertEq(hashes.length, 3);
        assertEq(hashes[0], HASH_A);
        assertEq(hashes[1], HASH_B);
        assertEq(hashes[2], HASH_C);
    }

    function test_getStampedHashes_pagination() public {
        vm.startPrank(auditor);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
        registry.recordStamp(HASH_B, 1, 55, bytes32(0));
        registry.recordStamp(HASH_C, 0, 10, bytes32(0));
        vm.stopPrank();

        bytes32[] memory page1 = registry.getStampedHashes(0, 2);
        assertEq(page1.length, 2);
        assertEq(page1[0], HASH_A);
        assertEq(page1[1], HASH_B);

        bytes32[] memory page2 = registry.getStampedHashes(2, 2);
        assertEq(page2.length, 1);
        assertEq(page2[0], HASH_C);
    }

    function test_getStampedHashes_offsetBeyondEnd() public {
        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);

        bytes32[] memory hashes = registry.getStampedHashes(10, 5);
        assertEq(hashes.length, 0);
    }

    function test_getStampedHashes_limitCappedAt100() public {
        // Record 5 stamps, request 200 — should return 5
        vm.startPrank(auditor);
        for (uint256 i = 0; i < 5; i++) {
            registry.recordStamp(keccak256(abi.encode(i)), 2, 80, REPORT_CID);
        }
        vm.stopPrank();

        bytes32[] memory hashes = registry.getStampedHashes(0, 200);
        assertEq(hashes.length, 5);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // setAuditorAgent (owner governance)
    // ─────────────────────────────────────────────────────────────────────────────

    function test_setAuditorAgent_rotatesAgent() public {
        vm.prank(owner);
        registry.setAuditorAgent(newAgent);
        assertEq(registry.auditorAgent(), newAgent);
    }

    function test_setAuditorAgent_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit SkillRegistry.AuditorAgentUpdated(auditor, newAgent);
        registry.setAuditorAgent(newAgent);
    }

    function test_setAuditorAgent_newAgentCanRecord() public {
        vm.prank(owner);
        registry.setAuditorAgent(newAgent);

        // Old auditor can no longer record
        vm.prank(auditor);
        vm.expectRevert(SkillRegistry.NotAuthorized.selector);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);

        // New agent can record
        vm.prank(newAgent);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID);
        assertTrue(registry.hasStamp(HASH_A));
    }

    function test_setAuditorAgent_revertsIfNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotOwner.selector);
        registry.setAuditorAgent(newAgent);
    }

    function test_setAuditorAgent_revertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(SkillRegistry.ZeroAddress.selector);
        registry.setAuditorAgent(address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // transferOwnership
    // ─────────────────────────────────────────────────────────────────────────────

    function test_transferOwnership() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        registry.transferOwnership(newOwner);
        assertEq(registry.owner(), newOwner);
    }

    function test_transferOwnership_revertsIfNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotOwner.selector);
        registry.transferOwnership(stranger);
    }

    function test_transferOwnership_revertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(SkillRegistry.ZeroAddress.selector);
        registry.transferOwnership(address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // setPaused
    // ─────────────────────────────────────────────────────────────────────────────

    function test_setPaused_pauseAndUnpause() public {
        vm.startPrank(owner);
        registry.setPaused(true);
        assertTrue(registry.paused());

        registry.setPaused(false);
        assertFalse(registry.paused());
        vm.stopPrank();
    }

    function test_setPaused_revertsIfNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(SkillRegistry.NotOwner.selector);
        registry.setPaused(true);
    }

    function test_unpause_allowsRecording() public {
        vm.prank(owner);
        registry.setPaused(true);

        vm.prank(owner);
        registry.setPaused(false);

        vm.prank(auditor);
        registry.recordStamp(HASH_A, 2, 80, REPORT_CID); // should not revert
        assertTrue(registry.hasStamp(HASH_A));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Fuzz
    // ─────────────────────────────────────────────────────────────────────────────

    function testFuzz_recordStamp_validParams(bytes32 hash, uint8 verdict, uint8 score) public {
        vm.assume(hash    != bytes32(0));
        vm.assume(verdict <= 2);
        vm.assume(score   <= 100);

        vm.prank(auditor);
        registry.recordStamp(hash, verdict, score, bytes32(0));

        SkillRegistry.AuditStamp memory s = registry.getStamp(hash);
        assertEq(s.verdict, verdict);
        assertEq(s.score,   score);
    }

    function testFuzz_isVerified_onlyTrueWhenSafeAndScoreGte70(
        bytes32 hash,
        uint8   verdict,
        uint8   score
    ) public {
        vm.assume(hash    != bytes32(0));
        vm.assume(verdict <= 2);
        vm.assume(score   <= 100);

        vm.prank(auditor);
        registry.recordStamp(hash, verdict, score, bytes32(0));

        bool expected = (verdict == 2 && score >= 70);
        assertEq(registry.isVerified(hash), expected);
    }
}
