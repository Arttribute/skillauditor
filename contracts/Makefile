.PHONY: build test fmt clean anvil deploy-local deploy-sepolia deploy-mainnet

# Load .env if present
-include .env
export

## Build contracts
build:
	forge build

## Run all tests with gas report
test:
	forge test -vvv --gas-report

## Run tests with verbosity (useful for debugging)
test-v:
	forge test -vvvv

## Run fuzz tests with more runs
fuzz:
	forge test --fuzz-runs 10000

## Format Solidity
fmt:
	forge fmt

## Clean build artifacts
clean:
	forge clean

## Start local Anvil chain (deterministic accounts, auto-mining)
anvil:
	anvil --chain-id 31337

## Deploy to local Anvil
deploy-local:
	forge script script/Deploy.s.sol \
		--rpc-url anvil \
		--broadcast \
		-vvvv

## Deploy to Base Sepolia + verify
deploy-sepolia:
	forge script script/Deploy.s.sol \
		--rpc-url base_sepolia \
		--broadcast \
		--verify \
		--etherscan-api-key $(BASESCAN_API_KEY) \
		-vvvv

## Deploy to Base Mainnet + verify
deploy-mainnet:
	forge script script/Deploy.s.sol \
		--rpc-url base \
		--broadcast \
		--verify \
		--etherscan-api-key $(BASESCAN_API_KEY) \
		-vvvv

## Generate ABI JSON files into erc7730/ (needed for Clear Signing registry submission)
abi:
	forge build --silent
	cat out/SkillRegistry.sol/SkillRegistry.json | jq '.abi' > erc7730/SkillRegistry.abi.json
	@echo "ABIs written to erc7730/"

## Validate ERC-7730 Clear Signing metadata (requires @ledgerhq/clear-signing-erc7730-developer-tools)
validate-erc7730:
	npx @ledgerhq/clear-signing-erc7730-developer-tools lint erc7730/SkillRegistry.json
