import { rateLimiter } from 'hono-rate-limiter'

// General rate limit — applied to all v1 routes
export const generalRateLimit = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 60,
  standardHeaders: 'draft-6',
  keyGenerator: (c) =>
    c.req.header('X-API-Key') ??
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For') ??
    'anonymous',
})

// Strict rate limit — applied to /v1/submit (audit submission)
// World ID nullifier dedup is the primary guard; this is a secondary layer
export const submitRateLimit = rateLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-6',
  keyGenerator: (c) =>
    c.req.header('X-API-Key') ??
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For') ??
    'anonymous',
})
