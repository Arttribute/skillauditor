// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SkillRegistry.sol";

/// @notice Deployment script for SkillRegistry.
///
/// Required env vars (copy .env.example → .env):
///   DEPLOYER_PRIVATE_KEY      — deployer EOA (pays gas, becomes owner)
///   AUDITOR_AGENT_ADDRESS     — address authorised to write stamps
///                               (use deployer address for now; swap to AgentKit wallet later)
///
/// Optional env vars (leave as 0x0 for first deploy — filled in by later modules):
///   ENS_REGISTRY_ADDRESS      — used by SkillSubnameRegistrar (Step 5)
///   ENS_RESOLVER_ADDRESS
///   ENS_ROOT_NODE
///
/// Deploy commands:
///
///   Local Anvil:
///     forge script script/Deploy.s.sol --rpc-url anvil --broadcast -vvvv
///
///   Base Sepolia:
///     forge script script/Deploy.s.sol \
///       --rpc-url base_sepolia \
///       --broadcast --verify \
///       --etherscan-api-key $BASESCAN_API_KEY \
///       -vvvv
///
///   Base Mainnet:
///     forge script script/Deploy.s.sol \
///       --rpc-url base \
///       --broadcast --verify \
///       --etherscan-api-key $BASESCAN_API_KEY \
///       -vvvv
///
/// After deployment:
///   1. Copy the printed SkillRegistry address into DEPLOYED-ADDRESSES.md
///   2. Set SKILL_REGISTRY_ADDRESS in apps/skillauditor-api/.env
///   3. Set NEXT_PUBLIC_SKILL_REGISTRY_ADDRESS in apps/skillauditor-app/.env

contract DeployScript is Script {
    function run() external {
        // ── Load env ──────────────────────────────────────────────────────────────
        uint256 deployerKey       = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress   = vm.addr(deployerKey);
        address auditorAgent      = vm.envOr("AUDITOR_AGENT_ADDRESS", deployerAddress);

        console2.log("=== SkillAuditor Deploy ===");
        console2.log("Chain ID:      ", block.chainid);
        console2.log("Deployer:      ", deployerAddress);
        console2.log("AuditorAgent:  ", auditorAgent);

        // ── Deploy ────────────────────────────────────────────────────────────────
        vm.startBroadcast(deployerKey);

        SkillRegistry registry = new SkillRegistry(
            deployerAddress, // owner — deployer EOA (rotate to multisig post-hackathon)
            auditorAgent     // auditorAgent — dev key now, AgentKit wallet in Step 4
        );

        vm.stopBroadcast();

        // ── Post-deploy summary ───────────────────────────────────────────────────
        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("SkillRegistry:  ", address(registry));
        console2.log("Owner:          ", registry.owner());
        console2.log("AuditorAgent:   ", registry.auditorAgent());
        console2.log("Chain ID:       ", block.chainid);
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Add to DEPLOYED-ADDRESSES.md:");
        console2.log("       SkillRegistry (Base Sepolia):", address(registry));
        console2.log("  2. Set in apps/skillauditor-api/.env:");
        console2.log("       SKILL_REGISTRY_ADDRESS=", address(registry));
        console2.log("  3. Set in apps/skillauditor-app/.env:");
        console2.log("       NEXT_PUBLIC_SKILL_REGISTRY_ADDRESS=", address(registry));
        console2.log("  4. Implement onchain-registry.ts to replace the no-op stub");
        console2.log("===========================");
    }
}
