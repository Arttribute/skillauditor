import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const logEntrySchema = new Schema({
  ts:      { type: Number, required: true },
  stage:   { type: String, required: true },
  level:   { type: String, enum: ['info', 'warn', 'error'], required: true },
  message: { type: String, required: true },
}, { _id: false })

const toolCallEntrySchema = new Schema({
  tool:          { type: String, required: true },
  target:        { type: String, required: true },
  method:        { type: String },
  payloadSample: { type: String },
  timestamp:     { type: Number, required: true },
}, { _id: false })

const sandboxRunSchema = new Schema({
  runId:                    { type: String, required: true },
  syntheticTask:            { type: String, required: true },
  toolCallLog:              { type: [toolCallEntrySchema], default: [] },
  networkAttemptsCount:     { type: Number, required: true, default: 0 },
  fileAccessCount:          { type: Number, required: true, default: 0 },
  outputLength:             { type: Number, required: true, default: 0 },
  deviatedFromStatedPurpose:{ type: Boolean, required: true, default: false },
}, { _id: false })

const findingSchema = new Schema({
  severity:    { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'], required: true },
  category: {
    type: String,
    enum: [
      // Content analysis categories
      'instruction_hijacking', 'identity_replacement', 'concealment_directive',
      'deceptive_description', 'social_engineering', 'scope_manipulation',
      'exfiltration_directive', 'conditional_activation',
      // Behavioral analysis categories
      'exfiltration', 'injection', 'scope_creep', 'inconsistency',
      'suspicious_url', 'deceptive_metadata',
    ],
    required: true,
  },
  description: { type: String, required: true },
  evidence:    { type: String, required: true },
  source:      { type: String, enum: ['content_analysis', 'behavioral_analysis', 'structural'] },
}, { _id: false })

const auditSchema = new Schema(
  {
    auditId:   { type: String, required: true, unique: true, index: true },
    skillHash: { type: String, required: true, index: true },
    skillName: { type: String, required: true },

    submittedBy: {
      userId:                    { type: String, required: true },
      worldIdNullifier:          { type: String, required: true },
      worldIdVerificationLevel:  { type: String, enum: ['orb', 'device'], required: true },
      submittedAt:               { type: Date, required: true },
    },

    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
    tier:   { type: String, enum: ['free', 'pro'], required: true },

    pipeline: {
      structuralAnalysis: { type: Schema.Types.Mixed, default: null },
      contentAnalysis:    { type: Schema.Types.Mixed, default: null },
      sandboxRuns:        { type: Schema.Types.Mixed, default: null },
      verdict:            { type: Schema.Types.Mixed, default: null },
    },

    result: {
      verdict:   { type: String, enum: ['safe', 'review_required', 'unsafe', null], default: null },
      score:     { type: Number, min: 0, max: 100, default: null },
      reportCid: { type: String, default: null },
    },

    findings: { type: [findingSchema], default: [] },

    onchain: {
      txHash:           { type: String, default: null },
      chainId:          { type: Number, default: null },
      contractAddress:  { type: String, default: null },
      ensSubname:       { type: String, default: null },
      stampedAt:        { type: Date, default: null },
    },

    logs: { type: [logEntrySchema], default: [] },

    completedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
)

export const Audit = mongoose.models.Audit ?? mongoose.model('Audit', auditSchema)
export type AuditDoc = InferSchemaType<typeof auditSchema>
