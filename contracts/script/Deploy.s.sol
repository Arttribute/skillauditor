// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SkillRegistry.sol";
import "../src/SkillSubnameRegistrar.sol";

/// @notice Deployment script for SkillAuditor contracts.
///
/// ── Two-chain architecture ────────────────────────────────────────────────────
///
///   SkillRegistry          → Base Sepolia (chain 84532) — already deployed
///   SkillSubnameRegistrar  → Ethereum Sepolia (chain 11155111) — this script
///
/// SkillRegistry lives on Base for cheap, fast stamp writes.
/// SkillSubnameRegistrar lives on Ethereum Sepolia where real ENS is deployed.
/// The API writes to both chains independently after each audit.
///
/// ── Pre-requisites (do these before running) ─────────────────────────────────
///
///   1. Register a .eth name on Ethereum Sepolia via https://app.ens.domains
///      (switch MetaMask to Sepolia, search any name, register for free)
///      Suggested: "skillauditor.eth" or "auditor.eth"
///
///   2. Create the `skills.<yourname>.eth` subname:
///      cast send $ENS_REGISTRY \
///        "setSubnodeRecord(bytes32,bytes32,address,address,uint64)" \
///        $(cast namehash <yourname>.eth) \
///        $(cast keccak "skills") \
///        $DEPLOYER_ADDRESS \
///        $ENS_RESOLVER_ADDRESS \
///        0 \
///        --rpc-url eth_sepolia --private-key $DEPLOYER_PRIVATE_KEY
///
///   3. Compute the root node for your subname:
///      cast namehash skills.<yourname>.eth
///      → paste result as ENS_ROOT_NODE in your .env
///
/// ── Deploy commands ───────────────────────────────────────────────────────────
///
///   Ethereum Sepolia (SkillSubnameRegistrar):
///     forge script script/Deploy.s.sol \
///       --rpc-url eth_sepolia \
///       --broadcast --verify \
///       --etherscan-api-key $ETHERSCAN_API_KEY \
///       -vvvv
///
///   Base Sepolia (SkillRegistry only — already done):
///     SKIP_REGISTRAR=true forge script script/Deploy.s.sol \
///       --rpc-url base_sepolia \
///       --broadcast --verify \
///       --etherscan-api-key $BASESCAN_API_KEY \
///       -vvvv
///
/// ── Required env vars ─────────────────────────────────────────────────────────
///   DEPLOYER_PRIVATE_KEY      Deployer EOA
///   AUDITOR_AGENT_ADDRESS     Address allowed to write stamps (default: deployer)
///
///   ENS_REGISTRY_ADDRESS      ENS Registry on Ethereum Sepolia:
///                               0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
///   ENS_RESOLVER_ADDRESS      Public Resolver on Ethereum Sepolia:
///                               0x8FADE66B79cC9f707aB26799354482EB93a5B7dD
///   ENS_ROOT_NODE             namehash("skills.<yourname>.eth")
///                               compute: cast namehash skills.<yourname>.eth
///
/// ── Post-deployment steps ─────────────────────────────────────────────────────
///   1. Update DEPLOYED-ADDRESSES.md with SkillSubnameRegistrar address
///   2. Transfer skills.<yourname>.eth ENS node ownership to SkillSubnameRegistrar:
///      cast send $ENS_REGISTRY \
///        "setSubnodeOwner(bytes32,bytes32,address)" \
///        $(cast namehash <yourname>.eth) \
///        $(cast keccak "skills") \
///        $SKILL_SUBNAME_REGISTRAR_ADDRESS \
///        --rpc-url eth_sepolia --private-key $DEPLOYER_PRIVATE_KEY
///   3. Set in apps/skillauditor-api/.env:
///        SKILL_SUBNAME_REGISTRAR_ADDRESS=<address>
///        SKILL_SUBNAME_CHAIN_ID=11155111
///        ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
///        ENS_ROOT_NODE=<namehash>
///        ENS_RESOLVER_ADDRESS=0x8FADE66B79cC9f707aB26799354482EB93a5B7dD

contract DeployScript is Script {
    address constant ZERO = address(0);

    // ENS Registry — same address on all networks where ENS is deployed
    address constant ENS_REGISTRY_SEPOLIA = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    // ENS Public Resolver on Ethereum Sepolia
    address constant ENS_RESOLVER_SEPOLIA = 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD;

    function run() external {
        uint256 deployerKey     = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerKey);
        address auditorAgent    = vm.envOr("AUDITOR_AGENT_ADDRESS", deployerAddress);
        bool    skipRegistrar   = vm.envOr("SKIP_REGISTRAR", false);

        // ENS vars — default to Ethereum Sepolia values
        address ensRegistry = vm.envOr("ENS_REGISTRY_ADDRESS", ENS_REGISTRY_SEPOLIA);
        address ensResolver = vm.envOr("ENS_RESOLVER_ADDRESS", ENS_RESOLVER_SEPOLIA);
        bytes32 ensRootNode = vm.envOr("ENS_ROOT_NODE", bytes32(0));

        bool deployRegistrar = !skipRegistrar && ensRootNode != bytes32(0);

        console2.log("=== SkillAuditor Deploy ===");
        console2.log("Chain ID:            ", block.chainid);
        console2.log("Deployer:            ", deployerAddress);
        console2.log("AuditorAgent:        ", auditorAgent);
        console2.log("Deploy Registrar:    ", deployRegistrar);
        if (deployRegistrar) {
            console2.log("ENS Registry:        ", ensRegistry);
            console2.log("ENS Resolver:        ", ensResolver);
            console2.log("ENS Root Node:       ", vm.toString(ensRootNode));
        }

        vm.startBroadcast(deployerKey);

        // ── SkillRegistry (Base Sepolia / any chain) ──────────────────────────────
        SkillRegistry registry = new SkillRegistry(
            deployerAddress,
            auditorAgent
        );

        // ── SkillSubnameRegistrar (Ethereum Sepolia — real ENS) ───────────────────
        SkillSubnameRegistrar registrar;
        if (deployRegistrar) {
            registrar = new SkillSubnameRegistrar(
                ensRegistry,
                ensResolver,
                ensRootNode,
                address(registry),
                deployerAddress,
                auditorAgent
            );
        }

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────────
        console2.log("");
        console2.log("=== Deployed ===");
        console2.log("SkillRegistry:           ", address(registry));
        if (deployRegistrar) {
            console2.log("SkillSubnameRegistrar:   ", address(registrar));
            console2.log("");
            console2.log("NEXT - transfer ENS node ownership to registrar:");
            console2.log("  (see DEPLOYED-ADDRESSES.md for cast send command)");
        }
        console2.log("");
        console2.log("NEXT - set in apps/skillauditor-api/.env:");
        console2.log("  SKILL_REGISTRY_ADDRESS=", address(registry));
        if (deployRegistrar) {
            console2.log("  SKILL_SUBNAME_REGISTRAR_ADDRESS=", address(registrar));
            console2.log("  SKILL_SUBNAME_CHAIN_ID=11155111");
            console2.log("  ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>");
            console2.log("  ENS_ROOT_NODE=", vm.toString(ensRootNode));
        }
        console2.log("===========================");
    }
}
