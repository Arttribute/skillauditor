// Builds the `agentkit` request header required by /v1/agent/submit.
//
// In dev mode (privateKey === 'dev' or WORLD_CHAIN_RPC_URL is absent on the server):
//   header value → "dev:<walletAddress>"
//   The server accepts this without signature verification.
//
// In prod mode (a real hex private key is supplied):
//   1. Derive the EVM address from the private key
//   2. Build a SIWE message using @worldcoin/agentkit's formatSIWEMessage
//   3. Sign the message with viem's signMessage (EIP-191)
//   4. JSON-encode the AgentkitPayload and base64-encode for the header
//
// The wallet must be registered in World AgentBook before prod calls will succeed:
//   npx @worldcoin/agentkit-cli register <wallet-address>

import { formatSIWEMessage } from '@worldcoin/agentkit'
import {
  privateKeyToAccount,
  type PrivateKeyAccount,
} from 'viem/accounts'
import { createHash, randomBytes } from 'crypto'

// CAIP-2 chain ID for World Chain mainnet (chainId 480)
const WORLD_CHAIN_ID = 'eip155:480'

function nonce(): string {
  return randomBytes(16).toString('hex')
}

function isDevKey(privateKey: string): boolean {
  return privateKey === 'dev' || privateKey.startsWith('dev:')
}

function deriveDevAddress(privateKey: string): string {
  // Deterministic fake address from the dev key string so the server
  // gets a stable identity across requests in the same session.
  const hash = createHash('sha256').update(privateKey).digest('hex')
  return `0x${hash.slice(0, 40)}`
}

/**
 * Build the `agentkit` header value for a request to a given URL.
 *
 * @param privateKey  Hex private key ("0x...") or "dev" for local bypass
 * @param resourceUrl The full URL of the endpoint being called
 */
export async function buildAgentkitHeader(
  privateKey: string,
  resourceUrl: string,
): Promise<string> {
  if (isDevKey(privateKey)) {
    const address = deriveDevAddress(privateKey)
    return `dev:${address}`
  }

  const key     = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const account = privateKeyToAccount(key as `0x${string}`)

  const url     = new URL(resourceUrl)
  const domain  = url.host
  const now     = new Date()
  const exp     = new Date(now.getTime() + 5 * 60 * 1_000) // 5 minute window

  // CompleteAgentkitInfo fields expected by formatSIWEMessage
  const info = {
    domain,
    uri:            resourceUrl,
    version:        '1',
    nonce:          nonce(),
    issuedAt:       now.toISOString(),
    expirationTime: exp.toISOString(),
    chainId:        WORLD_CHAIN_ID,
    type:           'eip191' as const,
  }

  const message   = formatSIWEMessage(info, account.address)
  const signature = await account.signMessage({ message })

  // AgentkitPayload shape that parseAgentkitHeader expects
  const payload = {
    domain:         info.domain,
    address:        account.address,
    uri:            info.uri,
    version:        info.version,
    chainId:        info.chainId,
    type:           info.type,
    nonce:          info.nonce,
    issuedAt:       info.issuedAt,
    expirationTime: info.expirationTime,
    signature,
  }

  return Buffer.from(JSON.stringify(payload)).toString('base64')
}
