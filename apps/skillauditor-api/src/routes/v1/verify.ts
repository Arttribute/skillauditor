import { Hono } from 'hono'
import { createHash } from 'crypto'
import { Audit } from '../../db/models/audit.js'
import { Skill } from '../../db/models/skill.js'

const verify = new Hono()

// POST /v1/verify — verify skill safety by content or hash
//
// Body (one of):
//   skillContent  string  — raw skill content (hash computed server-side)
//   skillHash     string  — pre-computed 0x-prefixed sha256 hex
//
// Returns latest completed audit verdict for this content hash.

verify.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  let skillHash: string

  if (typeof body.skillContent === 'string' && body.skillContent) {
    skillHash = `0x${createHash('sha256').update(body.skillContent).digest('hex')}`
  } else if (typeof body.skillHash === 'string' && body.skillHash) {
    skillHash = body.skillHash
  } else {
    return c.json({ error: 'skillContent or skillHash is required' }, 400)
  }

  // Check DB for latest completed audit
  const audit = await Audit.findOne(
    { skillHash, status: 'completed' },
    { auditId: 1, 'result.verdict': 1, 'result.score': 1, completedAt: 1 },
  )
    .sort({ completedAt: -1 })
    .lean()

  if (!audit) {
    return c.json({
      skillHash,
      verified:  false,
      verdict:   null,
      score:     null,
      message:   'No completed audit found for this skill. Submit at POST /v1/submit.',
    })
  }

  const doc = audit as Record<string, unknown>
  const result = doc.result as Record<string, unknown>

  const isSafe = result.verdict === 'safe' && (result.score as number) >= 70

  // Also pull ENS subname if stamped onchain
  const skill = await Skill.findOne({ hash: skillHash }, { ensSubname: 1 }).lean()
  const skillDoc = skill as Record<string, unknown> | null

  return c.json({
    skillHash,
    verified:    isSafe,
    verdict:     result.verdict,
    score:       result.score,
    auditId:     doc.auditId,
    auditedAt:   doc.completedAt,
    ensSubname:  skillDoc?.ensSubname ?? null,
    onchainStamp: null,  // populated when onchain registry is integrated
  })
})

export default verify
