// Interfaces for onchain + ENS registry clients
// Implemented in packages/skill-registry and packages/skill-ens

import type { Verdict } from './audit.js';
import type { OnchainStamp } from './audit.js';

export interface RecordStampParams {
  skillHash: string;          // 0x-prefixed hex
  verdict: Verdict;
  score: number;
  reportCid: string;          // IPFS CID
  ensSubname: string;
  nullifier: string;          // World ID nullifier hash
}

export interface IOnchainRegistry {
  checkStampByHash(hash: string): Promise<OnchainStamp | null>;
  isVerified(skillHash: string): Promise<boolean>;
  recordStamp(params: RecordStampParams): Promise<{ txHash: string }>;
  revokeStamp(skillHash: string): Promise<{ txHash: string }>;
}

export interface VerdictData {
  verdict: Verdict;
  score: number;
  reportCid: string;
  auditedAt: number;           // unix timestamp
  auditorEns: string;
  skillName: string;
  version: string;
}

export interface ENSAuditRecord {
  ensName: string;
  verdict: Verdict;
  score: number;
  reportCid: string;
  auditedAt: number;
  auditorEns: string;
}

export interface AuditorMetadata {
  worldIdVerificationLevel: string;
  totalAudits: number;
  trustScore: number;
  specialization?: string;
}

export interface IENSRegistry {
  getSkillENSName(skillHash: string): Promise<string>;
  resolveSkillVerdict(ensName: string): Promise<ENSAuditRecord | null>;
  registerSkillSubname(skillHash: string, verdictData: VerdictData): Promise<string>;
  updateVerdictTextRecords(ensName: string, data: VerdictData): Promise<void>;
  getAuditorENSName(agentAddress: string): Promise<string>;
  registerAuditorAgent(agentAddress: string, metadata: AuditorMetadata): Promise<string>;
}
