// World AgentKit middleware
//
// Verifies that an incoming request carries a valid World AgentKit credential,
// proving the agent is backed by a World ID-verified human.
//
// Flow for third-party agents:
//   1. Agent developer registers their wallet with World's AgentBook:
//        npx @worldcoin/agentkit-cli register <wallet-address>
//      This anchors the wallet to a real human's World ID on World Chain (chainId 480).
//
//   2. On each request, the agent constructs a SIWE (Sign-In-With-Ethereum) message
//      signed by its wallet, Base64-encodes it, and sends it in the `agentkit` header.
//
//   3. This middleware:
//        a. Parses the `agentkit` header into a structured AgentkitPayload
//        b. Validates the message (domain, URI, timestamps — max age 5 min)
//        c. Checks nonce hasn't been used before (replay protection, MongoDB-backed)
//        d. Verifies the EVM/Solana wallet signature
//        e. Resolves the wallet address → anonymous human identifier via AgentBook
//        f. Attaches agentWalletAddress + agentHumanId to Hono context
//
//   4. The agentHumanId is then used as the rate-limiting key (same semantics as a
//      World ID nullifier — one unique human, quota enforced per human not per wallet).
//
// Dev bypass: when WORLD_CHAIN_RPC_URL is absent the signature check and AgentBook
// lookup are skipped and a synthetic dev identity is produced.
//
// References:
//   World AgentKit docs:  https://docs.world.org/agents/agent-kit/integrate
//   AgentBook contract:   World Chain chainId 480

import { createMiddleware } from 'hono/factory'
import mongoose from 'mongoose'
import {
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  createAgentBookVerifier,
  type AgentkitPayload,
} from '@worldcoin/agentkit'

// ── Env config ────────────────────────────────────────────────────────────────

// Public RPC for World Chain (chainId 480). Required for signature verification
// and AgentBook lookups. Falls back to the public Alchemy endpoint.
const WORLD_CHAIN_RPC_URL =
  process.env.WORLD_CHAIN_RPC_URL ?? 'https://worldchain-mainnet.g.alchemy.com/public'

// CAIP-2 chain ID for World Chain mainnet (chainId 480).
// Use "eip155:4801" for World Chain testnet.
const WORLD_CHAIN_ID =
  process.env.WORLD_AGENTKIT_NETWORK === 'world-testnet' ? 'eip155:4801' : 'eip155:480'

// ── Nonce replay protection (MongoDB) ────────────────────────────────────────
// Each SIWE message includes a unique nonce. We record it on first use and
// reject any request that reuses the same nonce (replay attack mitigation).
// A TTL index expires records after 10 minutes — safely beyond the 5-minute
// message-age window enforced by validateAgentkitMessage.

const nonceSchema = new mongoose.Schema({
  nonce:     { type: String, required: true, unique: true, index: true },
  address:   { type: String, required: true, lowercase: true },
  usedAt:    { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) },
})
nonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const AgentkitNonce =
  mongoose.models['AgentkitNonce'] ?? mongoose.model('AgentkitNonce', nonceSchema)

// ── Context type ──────────────────────────────────────────────────────────────

export type WorldAgentkitContext = {
  Variables: {
    agentWalletAddress: string
    agentHumanId:       string
    authMethod:         'world-agentkit'
  }
}

// ── AgentBook resolver ────────────────────────────────────────────────────────
// createAgentBookVerifier returns a verifier that queries the AgentBook contract
// on World Chain to map a registered agent wallet → anonymous human identifier.
// This identifier is stable per human (like a World ID nullifier) and is used
// for rate limiting so the same human can't exceed quotas across multiple agents.

async function resolveAgentHumanId(walletAddress: string): Promise<string | null> {
  try {
    // createAgentBookVerifier queries the AgentBook contract on World Chain (chainId 480).
    // It maps a registered agent wallet → the anonymous human identifier associated
    // with the World ID that registered the agent. Returns null if not registered.
    const verifier = createAgentBookVerifier({ rpcUrl: WORLD_CHAIN_RPC_URL })
    return await verifier.lookupHuman(walletAddress, WORLD_CHAIN_ID)
  } catch (err) {
    console.warn('[world-agentkit] AgentBook lookup failed:', (err as Error).message)
    return null
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export const worldAgentkitMiddleware = createMiddleware<WorldAgentkitContext>(async (c, next) => {
  const rawHeader = c.req.header('agentkit') ?? c.req.header('Agentkit')

  // ── Dev bypass ─────────────────────────────────────────────────────────────
  // When WORLD_CHAIN_RPC_URL is not configured we accept a special dev header
  // value "dev:<address>" so local development works without a real agent wallet.
  if (!process.env.WORLD_CHAIN_RPC_URL && rawHeader?.startsWith('dev:')) {
    const devAddress = rawHeader.slice(4).toLowerCase() || 'dev_agent_000000000000000000'
    console.warn(
      '[world-agentkit] WORLD_CHAIN_RPC_URL not set — dev bypass active. ' +
      `Using synthetic identity for address: ${devAddress}`,
    )
    c.set('agentWalletAddress', devAddress)
    c.set('agentHumanId',       `dev_agent_${devAddress.slice(2, 18)}`)
    c.set('authMethod',         'world-agentkit')
    return next()
  }

  if (!rawHeader) {
    return c.json(
      {
        error:  'Missing agentkit header',
        detail: 'Include a signed World AgentKit credential in the agentkit request header.',
        docs:   'https://docs.world.org/agents/agent-kit/integrate',
      },
      401,
    )
  }

  // ── 1. Parse the credential ────────────────────────────────────────────────
  let payload: AgentkitPayload
  try {
    payload = parseAgentkitHeader(rawHeader)
  } catch (err) {
    return c.json(
      {
        error:  'Invalid agentkit header format',
        detail: (err as Error).message,
      },
      401,
    )
  }

  // ── 2. Validate message (domain, URI, timestamps) ─────────────────────────
  // Rejects messages older than 5 minutes or with a mismatched resource URI.
  const resourceUri = c.req.url
  try {
    validateAgentkitMessage(payload, resourceUri)
  } catch (err) {
    return c.json(
      {
        error:  'Agentkit message validation failed',
        detail: (err as Error).message,
      },
      401,
    )
  }

  // ── 3. Nonce replay protection ─────────────────────────────────────────────
  try {
    await AgentkitNonce.create({
      nonce:   payload.nonce,
      address: payload.address.toLowerCase(),
    })
  } catch (err) {
    // MongoDB duplicate-key error (code 11000) means nonce was already used.
    if ((err as { code?: number }).code === 11000) {
      return c.json({ error: 'Nonce already used — possible replay attack' }, 401)
    }
    // Any other DB error — surface as 503
    console.error('[world-agentkit] Nonce DB write failed:', (err as Error).message)
    return c.json({ error: 'Internal error during nonce check' }, 503)
  }

  // ── 4. Verify wallet signature ─────────────────────────────────────────────
  // verifyAgentkitSignature reconstructs the SIWE message from the payload and
  // verifies the signature against the declared wallet address.
  let verifyResult: { valid: boolean; address?: string; error?: string }
  try {
    verifyResult = await verifyAgentkitSignature(payload, WORLD_CHAIN_RPC_URL)
  } catch (err) {
    return c.json(
      {
        error:  'Signature verification failed',
        detail: (err as Error).message,
      },
      401,
    )
  }

  if (!verifyResult.valid) {
    return c.json(
      {
        error:  'Invalid agentkit signature',
        detail: verifyResult.error ?? 'Signature did not verify against declared wallet address',
      },
      401,
    )
  }

  // ── 5. AgentBook lookup — wallet → human identifier ────────────────────────
  // The human identifier is the anonymous, stable ID associated with the World ID
  // that registered this agent wallet in AgentBook. It serves the same purpose as
  // a World ID nullifier: one unique human, same ID every time.
  const humanId = await resolveAgentHumanId(payload.address)

  if (!humanId) {
    return c.json(
      {
        error:  'Agent wallet not registered in AgentBook',
        detail: 'Register your agent wallet with World before calling this API.',
        howTo:  'npx @worldcoin/agentkit-cli register <wallet-address>',
        docs:   'https://docs.world.org/agents/agent-kit/integrate',
      },
      403,
    )
  }

  // ── Attach verified identity to context ────────────────────────────────────
  c.set('agentWalletAddress', payload.address.toLowerCase())
  c.set('agentHumanId',       humanId)
  c.set('authMethod',         'world-agentkit')

  console.log(
    `[world-agentkit] verified — wallet=${payload.address.slice(0, 10)}…` +
    ` humanId=${humanId.slice(0, 16)}…`,
  )

  return next()
})
