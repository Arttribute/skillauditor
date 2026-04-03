import type {
  IOnchainRegistry,
  RecordStampParams,
  OnchainStamp,
} from '@skillauditor/skill-types'

// Stub implementation — replace with real Base/viem calls in P.2
export const onchainRegistry: IOnchainRegistry = {
  async checkStampByHash(_hash: string): Promise<OnchainStamp | null> {
    return null
  },

  async isVerified(_skillHash: string): Promise<boolean> {
    return false
  },

  async recordStamp(_params: RecordStampParams): Promise<{ txHash: string }> {
    throw new Error('onchainRegistry.recordStamp not yet implemented')
  },

  async revokeStamp(_skillHash: string): Promise<{ txHash: string }> {
    throw new Error('onchainRegistry.revokeStamp not yet implemented')
  },
}
