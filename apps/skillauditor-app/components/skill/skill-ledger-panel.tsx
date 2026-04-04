'use client'

import { LedgerApproveModal } from '@/components/ledger/ledger-approve-modal'

interface SkillLedgerPanelProps {
  skillHash: string
}

/**
 * Client shell that mounts LedgerApproveModal for the skill detail page.
 * Polls /v1/ledger/pending?skillHash= and shows the modal when the auditor
 * agent proposes an onchain stamp requiring Ledger hardware confirmation.
 */
export function SkillLedgerPanel({ skillHash }: SkillLedgerPanelProps) {
  return <LedgerApproveModal skillHash={skillHash} />
}
