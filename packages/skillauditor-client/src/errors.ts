export class SkillRejectedError extends Error {
  readonly verdict: string
  readonly score: number
  readonly auditId: string

  constructor(verdict: string, score: number, auditId: string) {
    super(`Skill rejected: verdict=${verdict} score=${score}/100`)
    this.name = 'SkillRejectedError'
    this.verdict = verdict
    this.score = score
    this.auditId = auditId
  }
}

export class AuditTimeoutError extends Error {
  readonly auditId: string

  constructor(auditId: string, timeoutMs: number) {
    super(`Audit ${auditId} did not complete within ${timeoutMs / 1000}s`)
    this.name = 'AuditTimeoutError'
    this.auditId = auditId
  }
}

export class PaymentError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'PaymentError'
    this.statusCode = statusCode
  }
}
