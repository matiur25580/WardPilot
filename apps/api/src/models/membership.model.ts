import { Schema, model } from 'mongoose';

export const membershipRoles = ['owner', 'admin', 'manager', 'staff', 'viewer'] as const;
export type MembershipRole = (typeof membershipRoles)[number];

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    role: { type: String, enum: membershipRoles, required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  },
  { timestamps: true },
);
membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

export const Membership = model('Membership', membershipSchema);
