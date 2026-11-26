import { Schema, model } from 'mongoose';

const tenantFields = {
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
};

const facilitySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 140 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
  type: { type: String, enum: ['hospital', 'clinic', 'urgent_care', 'specialty_center'], default: 'hospital', required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  address: {
    line1: { type: String, required: true, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    region: { type: String, trim: true, maxlength: 80 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
  },
  timezone: { type: String, default: 'Asia/Kolkata', trim: true, maxlength: 64 },
}, { timestamps: true });
facilitySchema.index({ organizationId: 1, code: 1 }, { unique: true });

const departmentSchema = new Schema({
  ...tenantFields,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
  description: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });
departmentSchema.index({ organizationId: 1, facilityId: 1, code: 1 }, { unique: true });

const buildingSchema = new Schema({
  ...tenantFields,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
  floors: { type: Number, required: true, min: 1, max: 200 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });
buildingSchema.index({ organizationId: 1, facilityId: 1, code: 1 }, { unique: true });

const wardSchema = new Schema({
  ...tenantFields,
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
  floor: { type: Number, required: true, min: 0, max: 200 },
  careType: { type: String, enum: ['general', 'icu', 'emergency', 'maternity', 'pediatric', 'surgical', 'isolation', 'other'], default: 'general' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });
wardSchema.index({ organizationId: 1, facilityId: 1, code: 1 }, { unique: true });

const bedSchema = new Schema({
  ...tenantFields,
  wardId: { type: Schema.Types.ObjectId, ref: 'Ward', required: true, index: true },
  label: { type: String, required: true, trim: true, maxlength: 32 },
  bedType: { type: String, enum: ['standard', 'icu', 'isolation', 'bariatric', 'pediatric'], default: 'standard' },
  status: { type: String, enum: ['available', 'reserved', 'occupied', 'cleaning', 'maintenance'], default: 'available', required: true },
}, { timestamps: true });
bedSchema.index({ organizationId: 1, wardId: 1, label: 1 }, { unique: true });
bedSchema.index({ organizationId: 1, facilityId: 1, status: 1 });

export const Facility = model('Facility', facilitySchema);
export const Department = model('Department', departmentSchema);
export const Building = model('Building', buildingSchema);
export const Ward = model('Ward', wardSchema);
export const Bed = model('Bed', bedSchema);
