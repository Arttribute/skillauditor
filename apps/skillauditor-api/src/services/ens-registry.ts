/**
 * ENS registry service — implements IENSRegistry using @skillauditor/skill-ens.
 *
 * SkillSubnameRegistrar is deployed on Ethereum Sepolia (chain 11155111) where
 * real ENS lives. SkillRegistry is on Base Sepolia (84532). The API talks to
 * both chains independently — stamps go to Base, ENS subnames go to Eth Sepolia.
 *
 * When SKILL_SUBNAME_REGISTRAR_ADDRESS is not configured, the service falls back
 * to returning deterministically-derived stub ENS names without on-chain writes
 * so the rest of the pipeline keeps running.
 */

import { SkillENSClient } from '@skillauditor/skill-ens'
import type { IENSRegistry, VerdictData, ENSAuditRecord, AuditorMetadata } from '@skillauditor/skill-types'
import type { Hex, Address } from 'viem'

function getConfig() {
  // ENS runs on Ethereum Sepolia (11155111) — separate from Base Sepolia (84532)
  // where SkillRegistry lives. Use SKILL_SUBNAME_CHAIN_ID to override.
  const chainId = Number(process.env.SKILL_SUBNAME_CHAIN_ID ?? '11155111')

  const rpcUrl = chainId === 1
    ? (process.env.ETH_MAINNET_RPC_URL ?? 'https://eth.llamarpc.com')
    : (process.env.ETH_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com')

  const registrarAddress = (process.env.SKILL_SUBNAME_REGISTRAR_ADDRESS ?? '') as Address | ''
  const resolverAddress  = (process.env.ENS_RESOLVER_ADDRESS             ?? '') as Address | ''
  const rootNode         = (process.env.ENS_ROOT_NODE                    ?? '') as Hex     | ''
  const privateKey       = (process.env.AUDITOR_AGENT_PRIVATE_KEY        ?? '') as Hex     | ''

  return {
    chainId,
    rpcUrl,
    registrarAddress: registrarAddress || null,
    resolverAddress:  resolverAddress  || null,
    rootNode:         rootNode         || null,
    privateKey:       privateKey       || null,
  }
}

function makeClient(): SkillENSClient {
  return new SkillENSClient(getConfig())
}

export const ensRegistry: IENSRegistry = {

  async getSkillENSName(skillHash: string): Promise<string> {
    return makeClient().getSkillENSName(skillHash)
  },

  async resolveSkillVerdict(ensName: string): Promise<ENSAuditRecord | null> {
    const { registrarAddress } = getConfig()
    if (!registrarAddress) {
      // ENS not yet deployed — cannot resolve
      return null
    }
    return makeClient().resolveSkillVerdict(ensName)
  },

  async registerSkillSubname(skillHash: string, verdictData: VerdictData): Promise<string> {
    const { registrarAddress } = getConfig()
    if (!registrarAddress) {
      // Graceful fallback: return the deterministic name without on-chain write.
      // This keeps the pipeline running while ENS deploy is pending.
      const h8 = skillHash.startsWith('0x')
        ? skillHash.slice(2, 10)
        : skillHash.slice(0, 8)
      const ensName = `${h8.toLowerCase()}.skills.skillauditor.eth`
      console.warn(
        `[ens-registry] SKILL_SUBNAME_REGISTRAR_ADDRESS not set — ` +
        `returning stub ENS name: ${ensName}`,
      )
      return ensName
    }
    return makeClient().registerSkillSubname(skillHash, verdictData)
  },

  async updateVerdictTextRecords(ensName: string, data: VerdictData): Promise<void> {
    const { registrarAddress, resolverAddress } = getConfig()
    if (!registrarAddress && !resolverAddress) {
      console.warn('[ens-registry] updateVerdictTextRecords: ENS not configured — skipping')
      return
    }
    return makeClient().updateVerdictTextRecords(ensName, data)
  },

  async getAuditorENSName(agentAddress: string): Promise<string> {
    return makeClient().getAuditorENSName(agentAddress)
  },

  async registerAuditorAgent(agentAddress: string, metadata: AuditorMetadata): Promise<string> {
    return makeClient().registerAuditorAgent(agentAddress, metadata)
  },
}
