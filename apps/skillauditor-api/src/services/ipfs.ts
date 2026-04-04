// IPFS upload service — Pinata
//
// Uploads the full audit report JSON to IPFS via Pinata and returns the CID.
// The CID is stored in the Audit record (`result.reportCid`) and passed to
// the onchain stamp so verifiers can retrieve the full report from IPFS.
//
// No-op when PINATA_JWT is not configured — reportCid stays null.

import type { AuditReport } from '@skillauditor/skill-types'

const PINATA_JWT      = process.env.PINATA_JWT ?? ''
const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'

export interface IPFSUploadResult {
  cid:     string
  url:     string
  isDev:   boolean
}

// ── Upload audit report to IPFS ───────────────────────────────────────────────

export async function uploadAuditReport(
  report: AuditReport,
): Promise<IPFSUploadResult | null> {
  if (!PINATA_JWT) {
    console.warn('[ipfs] PINATA_JWT not set — IPFS upload skipped (reportCid will be null)')
    return null
  }

  const payload = {
    pinataContent: report,
    pinataMetadata: {
      name:    `skillauditor-report-${report.skillHash.slice(0, 12)}-${Date.now()}`,
      keyvalues: {
        skillHash: report.skillHash,
        verdict:   report.verdict,
        auditedAt: report.auditedAt,
      },
    },
    pinataOptions: {
      cidVersion: 1,
    },
  }

  let res: Response
  try {
    res = await fetch(PINATA_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[ipfs] Pinata unreachable:', (err as Error).message)
    return null
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[ipfs] Pinata error ${res.status}: ${text}`)
    return null
  }

  const data = (await res.json()) as { IpfsHash: string }
  const cid  = data.IpfsHash

  return {
    cid,
    url:   `https://gateway.pinata.cloud/ipfs/${cid}`,
    isDev: false,
  }
}
