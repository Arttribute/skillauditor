import { Schema, model, models, type InferSchemaType } from 'mongoose'

const apiKeySchema = new Schema(
  {
    keyId:     { type: String, required: true, unique: true, index: true },
    keyHash:   { type: String, required: true, unique: true }, // bcrypt hash — never store raw
    userId:    { type: String, required: true, index: true },
    orgId:     { type: String, default: null },
    projectId: { type: String, default: null, index: true },
    name:      { type: String, required: true },
    lastUsedAt:{ type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } },
)

export const ApiKey = models.ApiKey ?? model('ApiKey', apiKeySchema)
export type ApiKeyDoc = InferSchemaType<typeof apiKeySchema>
