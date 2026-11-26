import { Schema, model } from 'mongoose';

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
  },
  { timestamps: true },
);

export const Organization = model('Organization', organizationSchema);
