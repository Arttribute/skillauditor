// Types for the three-agent audit pipeline

export interface SuspiciousPattern {
  pattern: string;
  location: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface StaticAnalysisReport {
  hash: string;
  frontmatter: {
    name?: string;
    description?: string;
    version?: string;
    tools?: string[];
    permissions?: string[];
  };
  externalUrls: string[];
  containsScripts: boolean;
  scriptLanguages: string[];
  declaredCapabilities: string[];
  lineCount: number;
  suspiciousPatterns: SuspiciousPattern[];
}

export interface ToolCallEntry {
  tool: string;
  target: string;           // URL, file path, or command
  method?: string;          // GET, POST, etc.
  payloadSample?: string;   // first 200 chars only
  timestamp: number;
}

export interface SandboxRun {
  runId: string;
  syntheticTask: string;
  toolCallLog: ToolCallEntry[];
  networkAttemptsCount: number;
  fileAccessCount: number;
  outputLength: number;
  deviatedFromStatedPurpose: boolean;
}

export interface SandboxBehaviorReport {
  runs: SandboxRun[];
  consistencyScore: number;   // 0-100; low = divergent behavior across runs
  exfiltrationAttempts: number;
  scopeViolations: number;
}

export type Verdict = 'safe' | 'review_required' | 'unsafe';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type FindingCategory =
  | 'exfiltration'
  | 'injection'
  | 'scope_creep'
  | 'inconsistency'
  | 'suspicious_url'
  | 'deceptive_metadata';

export interface AuditFinding {
  severity: Severity;
  category: FindingCategory;
  description: string;
  evidence: string;          // from behavioral report only, never raw skill content
}

export interface AuditDimensions {
  intentClarity: number;     // stated vs observed purpose alignment (0-100)
  scopeAdherence: number;    // stays within declared capabilities (0-100)
  exfiltrationRisk: number;  // attempts to send data out (0-100, lower = safer)
  injectionRisk: number;     // attempts to hijack agent (0-100, lower = safer)
  consistencyScore: number;  // same behavior across runs (0-100)
}

export interface AuditVerdict {
  verdict: Verdict;
  overallScore: number;      // 0-100 safety score
  dimensions: AuditDimensions;
  findings: AuditFinding[];
  recommendation: string;
}

export interface OnchainStamp {
  txHash: string;
  chainId: number;
  contractAddress: string;
  ensSubname: string;        // e.g. "abc123de.skills.auditor.eth"
  ipfsCid: string;
}

export interface AuditReport {
  version: '1.0.0';
  skillHash: string;
  skillName: string;
  auditedAt: string;         // ISO 8601
  auditorAgent: string;      // ENS name or address
  worldIdVerificationLevel: string;
  verdict: Verdict;
  overallScore: number;
  dimensions: AuditDimensions;
  findings: AuditFinding[];
  staticAnalysis: StaticAnalysisReport;
  behavioralAnalysis: SandboxBehaviorReport;
  recommendation: string;
  stamp?: OnchainStamp;
}
