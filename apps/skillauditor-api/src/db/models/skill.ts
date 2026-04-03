import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const skillSchema = new Schema(
  {
    hash:          { type: String, required: true, unique: true, index: true },
    name:          { type: String, required: true },
    version:       { type: String, required: true },
    description:   { type: String, required: true },
    latestAuditId: { type: String, required: true },
    latestVerdict: { type: String, enum: ['safe', 'review_required', 'unsafe', null], default: null },
    latestScore:   { type: Number, min: 0, max: 100, default: null },
    ensSubname:    { type: String, default: null },
    auditCount:    { type: Number, required: true, default: 1 },
    firstAuditedAt:{ type: Date, required: true },
    lastAuditedAt: { type: Date, required: true },
  },
  { timestamps: false },
)

export const Skill = mongoose.models.Skill ?? mongoose.model('Skill', skillSchema)
export type SkillDoc = InferSchemaType<typeof skillSchema>
