import { Schema, model, models, type InferSchemaType } from 'mongoose'

const ledgerApprovalSchema = new Schema(
  {
    approvalId:      { type: String, required: true, unique: true, index: true },
    agentId:         { type: String, required: true },
    userId:          { type: String, required: true, index: true },
    actionType:      { type: String, enum: ['recordStamp', 'revokeStamp', 'rotateAuditorAgent'], required: true },
    transactionData: { type: Schema.Types.Mixed, required: true },
    status:          { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
    signature:       { type: String, default: null },
    expiresAt:       { type: Date, required: true, index: { expireAfterSeconds: 0 } }, // MongoDB TTL index
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } },
)

export const LedgerApproval = models.LedgerApproval ?? model('LedgerApproval', ledgerApprovalSchema)
export type LedgerApprovalDoc = InferSchemaType<typeof ledgerApprovalSchema>
