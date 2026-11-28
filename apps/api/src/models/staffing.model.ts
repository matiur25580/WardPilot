import { Schema, model } from 'mongoose';

const staffShiftSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shiftType: { type: String, enum: ['day', 'evening', 'night', 'on_call'], required: true },
  roleLabel: { type: String, trim: true, maxlength: 100, default: '' },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'confirmed', 'completed', 'cancelled'], default: 'scheduled', required: true, index: true },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });
staffShiftSchema.index({ organizationId: 1, facilityId: 1, startAt: 1, status: 1 });
staffShiftSchema.index({ organizationId: 1, userId: 1, startAt: 1, endAt: 1, status: 1 });

const staffScheduleLockSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: Number, default: 0 }
}, { timestamps: true });
staffScheduleLockSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const StaffShift = model('StaffShift', staffShiftSchema);
export const StaffScheduleLock = model('StaffScheduleLock', staffScheduleLockSchema);

const staffShiftEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  shiftId: { type: Schema.Types.ObjectId, ref: 'StaffShift', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['created', 'confirmed', 'completed', 'cancelled'], required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, required: true }
}, { timestamps: true });
staffShiftEventSchema.index({ organizationId: 1, shiftId: 1, occurredAt: 1 });

export const StaffShiftEvent = model('StaffShiftEvent', staffShiftEventSchema);
