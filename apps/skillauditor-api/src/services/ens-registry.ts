import type {
  IENSRegistry,
  VerdictData,
  ENSAuditRecord,
  AuditorMetadata,
} from '@skillauditor/skill-types'

// Stub implementation — replace with real ENS/viem calls in P.2
export const ensRegistry: IENSRegistry = {
  async getSkillENSName(skillHash: string): Promise<string> {
    return `${skillHash.slice(2, 10)}.skills.auditor.eth`
  },

  async resolveSkillVerdict(_ensName: string): Promise<ENSAuditRecord | null> {
    return null
  },

  async registerSkillSubname(_skillHash: string, _verdictData: VerdictData): Promise<string> {
    throw new Error('ensRegistry.registerSkillSubname not yet implemented')
  },

  async updateVerdictTextRecords(_ensName: string, _data: VerdictData): Promise<void> {
    throw new Error('ensRegistry.updateVerdictTextRecords not yet implemented')
  },

  async getAuditorENSName(agentAddress: string): Promise<string> {
    return `agent-${agentAddress.slice(2, 10).toLowerCase()}.auditors.auditor.eth`
  },

  async registerAuditorAgent(_agentAddress: string, _metadata: AuditorMetadata): Promise<string> {
    throw new Error('ensRegistry.registerAuditorAgent not yet implemented')
  },
}
