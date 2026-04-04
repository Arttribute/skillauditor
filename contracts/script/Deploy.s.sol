// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SkillRegistry.sol";
import "../src/SkillSubnameRegistrar.sol";

/// @notice Deployment script for SkillRegistry (and optionally SkillSubnameRegistrar).
///
/// Required env vars (copy .env.example → .env):
///   DEPLOYER_PRIVATE_KEY      — deployer EOA (pays gas, becomes owner)
///   AUDITOR_AGENT_ADDRESS     — address authorised to write stamps
///                               (use deployer address for now; swap to AgentKit wallet later)
///
/// Optional env vars for SkillSubnameRegistrar (ENS module — Step 5):
///   ENS_REGISTRY_ADDRESS      — ENS registry (standard: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e on L1)
///   ENS_RESOLVER_ADDRESS      — ENS public resolver
///   ENS_ROOT_NODE             — namehash("skills.auditor.eth") — compute with: cast namehash skills.auditor.eth
///
///   If ENS_REGISTRY_ADDRESS is not set (or zero), only SkillRegistry is deployed.
///   Set all three ENS vars to also deploy SkillSubnameRegistrar.
///
/// Deploy commands:
///
///   Local Anvil (SkillRegistry only):
///     forge script script/Deploy.s.sol --rpc-url anvil --broadcast -vvvv
///
///   Base Sepolia (SkillRegistry only):
///     forge script script/Deploy.s.sol \
///       --rpc-url base_sepolia \
///       --broadcast --verify \
///       --etherscan-api-key $BASESCAN_API_KEY \
///       -vvvv
///
///   Base Sepolia (both contracts, once ENS addresses confirmed):
///     ENS_REGISTRY_ADDRESS=0x... ENS_RESOLVER_ADDRESS=0x... ENS_ROOT_NODE=0x... \
///     forge script script/Deploy.s.sol \
///       --rpc-url base_sepolia \
///       --broadcast --verify \
///       --etherscan-api-key $BASESCAN_API_KEY \
///       -vvvv
///
/// After deployment:
///   1. Copy addresses into DEPLOYED-ADDRESSES.md
///   2. Set SKILL_REGISTRY_ADDRESS in apps/skillauditor-api/.env
///   3. Set SKILL_SUBNAME_REGISTRAR_ADDRESS in apps/skillauditor-api/.env (if deployed)
///   4. Grant SkillSubnameRegistrar ownership of the `skills.auditor.eth` ENS node

contract DeployScript is Script {
    address constant ZERO = address(0);

    function run() external {
        // ── Load env ──────────────────────────────────────────────────────────────
        uint256 deployerKey     = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerKey);
        address auditorAgent    = vm.envOr("AUDITOR_AGENT_ADDRESS", deployerAddress);

        // ENS module — optional; only deployed when all three vars are set
        address ensRegistry  = vm.envOr("ENS_REGISTRY_ADDRESS",  ZERO);
        address ensResolver  = vm.envOr("ENS_RESOLVER_ADDRESS",  ZERO);
        bytes32 ensRootNode  = vm.envOr("ENS_ROOT_NODE", bytes32(0));
        bool    deployENS    = (ensRegistry != ZERO && ensResolver != ZERO && ensRootNode != bytes32(0));

        console2.log("=== SkillAuditor Deploy ===");
        console2.log("Chain ID:      ", block.chainid);
        console2.log("Deployer:      ", deployerAddress);
        console2.log("AuditorAgent:  ", auditorAgent);
        console2.log("Deploy ENS registrar:", deployENS);

        // ── Deploy ────────────────────────────────────────────────────────────────
        vm.startBroadcast(deployerKey);

        // Step 1: SkillRegistry (always deployed)
        SkillRegistry registry = new SkillRegistry(
            deployerAddress, // owner
            auditorAgent     // auditorAgent — dev key now; rotate to AgentKit wallet in Step 4
        );

        // Step 5: SkillSubnameRegistrar (only when ENS addresses provided)
        SkillSubnameRegistrar registrar;
        if (deployENS) {
            registrar = new SkillSubnameRegistrar(
                ensRegistry,
                ensResolver,
                ensRootNode,
                address(registry),
                deployerAddress, // owner
                auditorAgent     // auditorAgent — must match registry's auditorAgent
            );
        }

        vm.stopBroadcast();

        // ── Post-deploy summary ───────────────────────────────────────────────────
        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("SkillRegistry:           ", address(registry));
        console2.log("Owner:                   ", registry.owner());
        console2.log("AuditorAgent:            ", registry.auditorAgent());
        console2.log("Chain ID:                ", block.chainid);
        if (deployENS) {
            console2.log("SkillSubnameRegistrar:   ", address(registrar));
        } else {
            console2.log("SkillSubnameRegistrar:   (not deployed — ENS vars not set)");
        }
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Update DEPLOYED-ADDRESSES.md:");
        console2.log("       SkillRegistry:", address(registry));
        if (deployENS) {
            console2.log("       SkillSubnameRegistrar:", address(registrar));
        }
        console2.log("  2. Set in apps/skillauditor-api/.env:");
        console2.log("       SKILL_REGISTRY_ADDRESS=", address(registry));
        if (deployENS) {
            console2.log("       SKILL_SUBNAME_REGISTRAR_ADDRESS=", address(registrar));
        }
        if (deployENS) {
            console2.log("  3. Transfer `skills.auditor.eth` ENS node ownership to SkillSubnameRegistrar:");
            console2.log("       cast send $ENS_REGISTRY setSubnodeOwner($ENS_ROOT_PARENT, $LABEL, ", address(registrar), ")");
        } else {
            console2.log("  3. When ENS addresses are available, redeploy with:");
            console2.log("       ENS_REGISTRY_ADDRESS=0x... ENS_RESOLVER_ADDRESS=0x... ENS_ROOT_NODE=0x...");
        }
        console2.log("===========================");
    }
}
