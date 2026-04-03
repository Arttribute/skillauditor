import { Hono } from 'hono'

const verify = new Hono()

// POST /v1/verify — verify skill content hash against onchain registry
verify.post('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default verify
