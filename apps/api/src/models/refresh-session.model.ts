import { Schema, model } from 'mongoose';

const refreshSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: null, select: false },
    userAgent: { type: String, maxlength: 500 },
    ipAddress: { type: String, maxlength: 64 },
  },
  { timestamps: true },
);
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ userId: 1, organizationId: 1, revokedAt: 1 });

export const RefreshSession = model('RefreshSession', refreshSessionSchema);
