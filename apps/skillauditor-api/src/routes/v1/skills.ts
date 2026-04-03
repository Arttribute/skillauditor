import { Hono } from 'hono'

const skills = new Hono()

// GET /v1/skills — browse registry (paginated, filterable)
skills.get('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// GET /v1/skills/:hash — get skill by content hash
skills.get('/:hash', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default skills
