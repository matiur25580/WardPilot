import { Schema, model } from 'mongoose';

const patientSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  medicalRecordNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  dateOfBirth: { type: Date, default: null },
  phone: { type: String, trim: true, maxlength: 24, select: false },
}, { timestamps: true });
patientSchema.index({ organizationId: 1, medicalRecordNumber: 1 }, { unique: true });

const admissionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  bedId: { type: Schema.Types.ObjectId, ref: 'Bed', required: true, index: true },
  status: { type: String, enum: ['admitted', 'discharged'], default: 'admitted', required: true, index: true },
  admittedAt: { type: Date, required: true, default: Date.now },
  dischargedAt: { type: Date, default: null },
  admissionReason: { type: String, required: true, trim: true, maxlength: 500 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  dischargedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
admissionSchema.index({ organizationId: 1, status: 1, admittedAt: -1 });
admissionSchema.index({ organizationId: 1, patientId: 1, status: 1 });
// A patient can have only one active admission per tenant, even under concurrent requests.
admissionSchema.index(
  { organizationId: 1, patientId: 1 },
  { unique: true, partialFilterExpression: { status: 'admitted' }, name: 'one_active_admission_per_patient' },
);

const patientFlowEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  admissionId: { type: Schema.Types.ObjectId, ref: 'Admission', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['admitted', 'transferred', 'discharged'], required: true },
  fromBedId: { type: Schema.Types.ObjectId, ref: 'Bed', default: null },
  toBedId: { type: Schema.Types.ObjectId, ref: 'Bed', default: null },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  occurredAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });
patientFlowEventSchema.index({ organizationId: 1, admissionId: 1, occurredAt: 1 });

export const Patient = model('Patient', patientSchema);
export const Admission = model('Admission', admissionSchema);
export const PatientFlowEvent = model('PatientFlowEvent', patientFlowEventSchema);
