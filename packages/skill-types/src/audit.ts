// Types for the four-stage audit pipeline:
// 1. Structural Extractor  — deterministic metadata (no LLM)
// 2. Content Analyst       — LLM reads raw skill, semantic findings
// 3. Sandbox Runner        — LLM executes skill with mock tools, behavioral report
// 4. Verdict Agent         — LLM synthesises all three reports, never sees raw skill

// ── Stage 1: Structural Extractor ─────────────────────────────────────────────

export interface StaticAnalysisReport {
  hash: string;                    // SHA-256 of raw skill content — skill identity
  frontmatter: {
    name?: string;
    description?: string;
    version?: string;
    tools?: string[];              // declared tool requirements
    permissions?: string[];
  };
  externalUrls: string[];          // all URLs found in content
  containsScripts: boolean;        // code blocks present
  scriptLanguages: string[];       // bash, python, js, etc.
  declaredCapabilities: string[];  // tools + permissions combined
  lineCount: number;
}

// ── Stage 2: Content Analyst ──────────────────────────────────────────────────

export type ContentFindingCategory =
  | 'instruction_hijacking'   // tries to override agent's base instructions
  | 'identity_replacement'    // tries to redefine the agent's role or persona
  | 'concealment_directive'   // tells the agent to hide its instructions
  | 'deceptive_description'   // stated purpose doesn't match actual instructions
  | 'social_engineering'      // manipulative language patterns (urgency, authority)
  | 'scope_manipulation'      // inflates or misrepresents required access
  | 'exfiltration_directive'  // instructs agent to send data to external endpoint
  | 'conditional_activation'; // contains logic that activates only in specific contexts

export interface ContentFinding {
  severity: Severity;
  category: ContentFindingCategory;
  description: string;
  evidence: string;  // short quoted snippet from the skill (the specific text that raised concern)
}

export interface ContentAnalystReport {
  findings: ContentFinding[];
  intentAlignment: number;         // 0-100: how well stated purpose matches actual instructions
  deceptionRisk: number;           // 0-100: risk that description misleads about true intent
  manipulationPatterns: string[];  // named patterns observed (e.g. "authority_claim", "urgency_injection")
  statedPurposeSummary: string;    // analyst's read of what the skill is actually trying to do
  overallRisk: 'low' | 'medium' | 'high';
}

// ── Stage 3: Sandbox Runner ───────────────────────────────────────────────────

export interface ToolCallEntry {
  tool: string;
  target: string;           // URL, file path, command, or mcp server/tool
  method?: string;          // GET, POST, MCP, etc.
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
  consistencyScore: number;      // 0-100; low = divergent behavior across runs
  exfiltrationAttempts: number;
  scopeViolations: number;
}

// ── Stage 4: Verdict Agent ────────────────────────────────────────────────────

export type Verdict = 'safe' | 'review_required' | 'unsafe';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

// Behavioral findings (from sandbox evidence — never from raw skill content)
export type BehavioralFindingCategory =
  | 'exfiltration'
  | 'injection'
  | 'scope_creep'
  | 'inconsistency'
  | 'suspicious_url'
  | 'deceptive_metadata';

// FindingCategory union — covers both content and behavioral sources
export type FindingCategory = ContentFindingCategory | BehavioralFindingCategory;

export interface AuditFinding {
  severity: Severity;
  category: FindingCategory;
  description: string;
  evidence: string;
  source: 'content_analysis' | 'behavioral_analysis' | 'structural';
}

export interface AuditDimensions {
  intentClarity: number;     // stated vs observed purpose alignment (0-100)
  scopeAdherence: number;    // stays within declared capabilities (0-100)
  exfiltrationRisk: number;  // attempts to send data out (0-100, higher = more risk)
  injectionRisk: number;     // attempts to hijack agent (0-100, higher = more risk)
  consistencyScore: number;  // same behavior across sandbox runs (0-100)
}

export interface AuditVerdict {
  verdict: Verdict;
  overallScore: number;      // 0-100 safety score
  dimensions: AuditDimensions;
  findings: AuditFinding[];
  recommendation: string;
}

// ── Full audit report ─────────────────────────────────────────────────────────

export interface OnchainStamp {
  txHash: string;
  chainId: number;
  contractAddress: string;
  ensSubname: string;
  ipfsCid: string;
}

export interface AuditReport {
  version: '1.0.0';
  skillHash: string;
  skillName: string;
  auditedAt: string;         // ISO 8601
  auditorAgent: string;
  worldIdVerificationLevel: string;
  verdict: Verdict;
  overallScore: number;
  dimensions: AuditDimensions;
  findings: AuditFinding[];
  structuralAnalysis: StaticAnalysisReport;
  contentAnalysis: ContentAnalystReport;
  behavioralAnalysis: SandboxBehaviorReport;
  recommendation: string;
  reportCid?: string;      // IPFS CID — set after Pinata upload, absent when IPFS skipped
  stamp?: OnchainStamp;
}
