/**
 * Onchain registry service — implements IOnchainRegistry by delegating to
 * @skillauditor/skill-registry (SkillRegistryClient).
 *
 * All viem/contract logic lives in the package; this file just wires env vars.
 */

import { SkillRegistryClient } from '@skillauditor/skill-registry'
import type { IOnchainRegistry, RecordStampParams, OnchainStamp } from '@skillauditor/skill-types'
import type { Hex, Address } from 'viem'

function getConfig() {
  const chainId  = Number(process.env.SKILL_REGISTRY_CHAIN_ID ?? '84532')
  const rpcUrl   = chainId === 8453
    ? (process.env.BASE_MAINNET_RPC_URL ?? 'https://mainnet.base.org')
    : (process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org')
  const addr     = (process.env.SKILL_REGISTRY_ADDRESS ?? '') as Address
  const pk       = (process.env.AUDITOR_AGENT_PRIVATE_KEY ?? '') as Hex | ''
  return { chainId, rpcUrl, contractAddress: addr, privateKey: pk || null }
}

function makeClient(): SkillRegistryClient {
  return new SkillRegistryClient(getConfig())
}

export const onchainRegistry: IOnchainRegistry = {

  async checkStampByHash(hash: string): Promise<OnchainStamp | null> {
    const { contractAddress } = getConfig()
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      console.warn('[onchain-registry] SKILL_REGISTRY_ADDRESS not set — returning null')
      return null
    }
    return makeClient().checkStampByHash(hash)
  },

  async isVerified(skillHash: string): Promise<boolean> {
    const { contractAddress } = getConfig()
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      return false
    }
    return makeClient().isVerified(skillHash)
  },

  async recordStamp(params: RecordStampParams): Promise<{ txHash: string }> {
    const { contractAddress, privateKey } = getConfig()
    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      console.warn('[onchain-registry] SKILL_REGISTRY_ADDRESS not set — skipping onchain stamp')
      return { txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' }
    }
    if (!privateKey) {
      console.warn('[onchain-registry] AUDITOR_AGENT_PRIVATE_KEY not set — skipping onchain stamp')
      return { txHash: '0x0000000000000000000000000000000000000000000000000000000000000000' }
    }
    return makeClient().recordStamp(params)
  },

  async revokeStamp(skillHash: string): Promise<{ txHash: string }> {
    return makeClient().revokeStamp(skillHash)
  },
}
