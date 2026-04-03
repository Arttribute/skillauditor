// API response shapes for the skillauditor-app.
// These mirror what the skillauditor-api returns over HTTP.
// Intentionally self-contained — no workspace:* imports.

export type Verdict = 'safe' | 'review_required' | 'unsafe';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type FindingCategory =
  | 'exfiltration'
  | 'injection'
  | 'scope_creep'
  | 'inconsistency'
  | 'suspicious_url'
  | 'deceptive_metadata';

export type AuditStatus = 'pending' | 'running' | 'completed' | 'failed';
export type AuditTier = 'free' | 'pro';
export type UserPlan = 'free' | 'pro' | 'enterprise';

// ── Audit responses ────────────────────────────────────────────────────────────

export interface AuditFinding {
  severity: Severity;
  category: FindingCategory;
  description: string;
  evidence: string;
}

export interface AuditDimensions {
  intentClarity: number;
  scopeAdherence: number;
  exfiltrationRisk: number;
  injectionRisk: number;
  consistencyScore: number;
}

export interface OnchainStamp {
  txHash: string;
  chainId: number;
  contractAddress: string;
  ensSubname: string;
  ipfsCid: string;
}

export interface AuditResponse {
  auditId: string;
  skillHash: string;
  skillName: string;
  status: AuditStatus;
  tier: AuditTier;
  verdict: Verdict | null;
  score: number | null;
  dimensions: AuditDimensions | null;
  findings: AuditFinding[];
  recommendation: string | null;
  reportCid: string | null;
  stamp: OnchainStamp | null;
  createdAt: string;
  completedAt: string | null;
}

// ── Skill responses ────────────────────────────────────────────────────────────

export interface SkillResponse {
  hash: string;
  name: string;
  version: string;
  description: string;
  latestVerdict: Verdict | null;
  latestScore: number | null;
  ensSubname: string | null;
  auditCount: number;
  latestAuditId: string;
  lastAuditedAt: string;
}

export interface SkillListResponse {
  skills: SkillResponse[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Verify response ────────────────────────────────────────────────────────────

export interface VerifyResponse {
  skillHash: string;
  isVerified: boolean;
  verdict: Verdict | null;
  score: number | null;
  ensSubname: string | null;
  stamp: OnchainStamp | null;
}

// ── Submit response ────────────────────────────────────────────────────────────

export interface SubmitResponse {
  auditId: string;
  skillHash: string;
  status: AuditStatus;
  tier: AuditTier;
}

// ── User / management responses ────────────────────────────────────────────────

export interface UserResponse {
  userId: string;
  email: string | null;
  walletAddress: string | null;
  plan: UserPlan;
  auditCredits: number;
  usageThisMonth: number;
}

export interface ApiKeyResponse {
  keyId: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

// ── Ledger responses ───────────────────────────────────────────────────────────

export interface LedgerApprovalResponse {
  approvalId: string;
  actionType: string;
  transactionData: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
}
