// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

/// @notice Deployment script skeleton.
///         Contracts (SkillRegistry, SkillSubnameRegistrar) will be added here
///         once implemented. For now the script compiles and logs deploy context.
///
///  Local anvil:
///    forge script script/Deploy.s.sol --rpc-url anvil --broadcast
///
///  Base Sepolia:
///    forge script script/Deploy.s.sol \
///      --rpc-url base_sepolia \
///      --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
///
///  Base Mainnet:
///    forge script script/Deploy.s.sol \
///      --rpc-url base \
///      --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
///
/// Required env vars (copy .env.example -> .env):
///   DEPLOYER_PRIVATE_KEY
///   AUDITOR_AGENT_ADDRESS
///   BASE_SEPOLIA_RPC_URL / BASE_MAINNET_RPC_URL
///   BASESCAN_API_KEY
///   ENS_REGISTRY_ADDRESS / ENS_RESOLVER_ADDRESS / ENS_ROOT_NODE
contract DeployScript is Script {
    function run() external view {
        console2.log("=== SkillAuditor Deploy ===");
        console2.log("Chain ID: ", block.chainid);
        console2.log("Contracts not yet implemented -- add imports here when ready.");
        console2.log("==========================");
    }
}
