// MongoDB document shapes

import type { Verdict } from './audit.js';
import type { StaticAnalysisReport, SandboxBehaviorReport, AuditVerdict } from './audit.js';

export type AuditStatus = 'pending' | 'running' | 'completed' | 'failed';
export type AuditTier = 'free' | 'pro';
export type UserPlan = 'free' | 'pro' | 'enterprise';
export type WorldIdVerificationLevel = 'orb' | 'device';

export interface AuditRecord {
  auditId: string;
  skillHash: string;
  skillName: string;
  submittedBy: {
    userId: string;
    worldIdNullifier: string;
    worldIdVerificationLevel: WorldIdVerificationLevel;
    submittedAt: Date;
  };
  status: AuditStatus;
  tier: AuditTier;
  pipeline: {
    staticAnalysis: StaticAnalysisReport | null;
    sandboxRuns: SandboxBehaviorReport | null;
    semanticJudge: AuditVerdict | null;
  };
  result: {
    verdict: Verdict | null;
    score: number | null;
    reportCid: string | null;   // IPFS CID of full report
  };
  onchain: {
    txHash: string | null;
    ensSubname: string | null;
    stampedAt: Date | null;
  };
  completedAt: Date | null;
  createdAt: Date;
}

export interface SkillRecord {
  hash: string;
  name: string;
  version: string;
  description: string;
  latestAuditId: string;
  latestVerdict: Verdict | null;
  latestScore: number | null;
  ensSubname: string | null;
  auditCount: number;
  firstAuditedAt: Date;
  lastAuditedAt: Date;
}

export interface UserRecord {
  userId: string;               // Privy DID
  email: string | null;
  walletAddress: string | null;
  worldIdNullifier: string | null;
  worldIdVerificationLevel: WorldIdVerificationLevel | null;
  plan: UserPlan;
  auditCredits: number;
  usageThisMonth: number;
  createdAt: Date;
}

export interface ApiKeyRecord {
  keyId: string;
  keyHash: string;              // bcrypt hash — never store raw
  userId: string;
  orgId: string | null;
  projectId: string | null;
  name: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface LedgerApprovalRecord {
  approvalId: string;
  agentId: string;
  userId: string;
  actionType: 'recordStamp' | 'revokeStamp' | 'rotateAuditorAgent';
  transactionData: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  signature: string | null;
  createdAt: Date;
  expiresAt: Date;              // TTL — 5 minutes
}
