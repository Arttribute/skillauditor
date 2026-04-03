import { Hono } from 'hono'

const submit = new Hono()

// POST /v1/submit — submit a skill for audit (World ID proof required)
submit.post('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default submit
