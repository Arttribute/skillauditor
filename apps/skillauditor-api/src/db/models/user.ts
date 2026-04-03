import { Schema, model, models, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    userId:                   { type: String, required: true, unique: true, index: true },
    email:                    { type: String, default: null },
    walletAddress:            { type: String, default: null },
    worldIdNullifier:         { type: String, default: null },
    worldIdVerificationLevel: { type: String, enum: ['orb', 'device', null], default: null },
    plan:                     { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    auditCredits:             { type: Number, default: 0 },
    usageThisMonth:           { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
)

export const User = models.User ?? model('User', userSchema)
export type UserDoc = InferSchemaType<typeof userSchema>
