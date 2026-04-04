import { AuditTimeoutError, SkillRejectedError } from './errors.js'

export interface AuditFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  description: string
  evidence?: string
}

export interface OnchainStamp {
  txHash: string
  chainId: number
  contractAddress: string
  ensName?: string
  stampedAt: string
}

export interface VerifyResult {
  verified: boolean
  verdict: 'safe' | 'review_required' | 'unsafe'
  score: number
  auditId: string
  skillHash: string
  auditedAt: string
  onchain?: OnchainStamp
  findings?: AuditFinding[]
  ensSubname?: string
}

export interface ProgressEvent {
  stage: 'structural' | 'content' | 'sandbox' | 'verdict' | 'onchain' | 'pipeline'
  level: 'info' | 'warn' | 'error'
  message: string
  ts: number
}

export interface PollOptions {
  /** How often to check audit status. Default: 3000ms */
  intervalMs?: number
  /** Give up after this many ms. Default: 5 minutes */
  timeoutMs?: number
  /** Called with live pipeline log entries as they arrive */
  onProgress?: (event: ProgressEvent) => void
  /** Throw SkillRejectedError when verdict != 'safe' or score < 70. Default: true */
  rejectOnUnsafe?: boolean
}

export async function pollUntilComplete(
  apiUrl: string,
  auditId: string,
  opts: PollOptions = {},
): Promise<VerifyResult> {
  const {
    intervalMs    = 3_000,
    timeoutMs     = 5 * 60 * 1_000,
    onProgress,
    rejectOnUnsafe = true,
  } = opts

  const deadline = Date.now() + timeoutMs
  let lastLogTs = 0

  while (Date.now() < deadline) {
    // Poll audit status
    const res  = await fetch(`${apiUrl}/v1/audits/${auditId}`)
    const data = await res.json() as Record<string, unknown>

    if (data.status === 'completed') {
      const result  = data.result  as { verdict: string; score: number } | undefined
      const onchain = data.onchain as OnchainStamp | undefined

      const verdict  = (result?.verdict ?? 'unsafe') as VerifyResult['verdict']
      const score    = result?.score ?? 0
      const verified = verdict === 'safe' && score >= 70

      if (rejectOnUnsafe && !verified) {
        throw new SkillRejectedError(verdict, score, auditId)
      }

      return {
        verified,
        verdict,
        score,
        auditId,
        skillHash: data.skillHash as string,
        auditedAt: data.completedAt as string,
        onchain:   onchain?.txHash ? onchain : undefined,
        findings:  data.findings as AuditFinding[] | undefined,
        ensSubname: onchain?.ensName,
      }
    }

    if (data.status === 'failed') {
      throw new Error(`Audit ${auditId} pipeline failed. Try resubmitting.`)
    }

    // Stream new log entries to onProgress if provided
    if (onProgress && (data.status === 'running' || data.status === 'pending')) {
      try {
        const logRes  = await fetch(`${apiUrl}/v1/audits/${auditId}/logs?since=${lastLogTs}`)
        const logData = await logRes.json() as { logs: ProgressEvent[] }
        for (const entry of logData.logs ?? []) {
          onProgress(entry)
          if (entry.ts > lastLogTs) lastLogTs = entry.ts
        }
      } catch {
        // non-fatal — progress streaming is best-effort
      }
    }

    await sleep(intervalMs)
  }

  throw new AuditTimeoutError(auditId, timeoutMs)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
