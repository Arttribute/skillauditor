/**
 * ENS registry service — implements IENSRegistry using @skillauditor/skill-ens.
 *
 * When SKILL_SUBNAME_REGISTRAR_ADDRESS is configured, subname registration
 * and resolution is fully on-chain.  When the variable is absent (ENS not yet
 * deployed — see BRANCH-PLAN-onchain-identity.md Blocker 1) the service falls
 * back to returning deterministically-derived ENS names without on-chain writes.
 */

import { SkillENSClient } from '@skillauditor/skill-ens'
import type { IENSRegistry, VerdictData, ENSAuditRecord, AuditorMetadata } from '@skillauditor/skill-types'
import type { Hex, Address } from 'viem'

function getConfig() {
  const chainId    = Number(process.env.SKILL_REGISTRY_CHAIN_ID ?? '84532')
  const rpcUrl     = chainId === 8453
    ? (process.env.BASE_MAINNET_RPC_URL ?? 'https://mainnet.base.org')
    : (process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org')

  const registrarAddress = (process.env.SKILL_SUBNAME_REGISTRAR_ADDRESS ?? '') as Address | ''
  const resolverAddress  = (process.env.ENS_RESOLVER_ADDRESS ?? '') as Address | ''
  const privateKey       = (process.env.AUDITOR_AGENT_PRIVATE_KEY ?? '') as Hex | ''

  return {
    chainId,
    rpcUrl,
    registrarAddress: registrarAddress || null,
    resolverAddress:  resolverAddress  || null,
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
      const ensName = `${h8.toLowerCase()}.skills.auditor.eth`
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
