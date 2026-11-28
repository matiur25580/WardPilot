import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/auth.middleware';
import { Bed, Facility, Ward } from '../models/resource.model';
import { Admission, Patient, PatientFlowEvent } from '../models/patient-flow.model';
import { canDischarge, canTransfer, normalizeMedicalRecordNumber } from '../services/patient-flow';

export const patientFlowRouter = Router();
patientFlowRouter.use(authenticate);
const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const admissionInput = z.object({
  facilityId: idSchema, bedId: idSchema,
  medicalRecordNumber: z.string().trim().min(2).max(32),
  firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  dateOfBirth: z.string().datetime().optional(), phone: z.string().trim().max(24).optional(),
  admissionReason: z.string().trim().min(2).max(500),
});
const transferInput = z.object({ bedId: idSchema, note: z.string().trim().max(500).optional() });
const dischargeInput = z.object({ note: z.string().trim().max(500).optional() });
const writable = requireRoles('owner', 'admin', 'manager', 'staff');

function tenantId(req: Express.Request): Types.ObjectId { return new Types.ObjectId(req.auth!.organizationId); }
function fail(status: number, code: string, message: string): never {
  const error = new Error(message) as Error & { status: number; code: string };
  error.status = status; error.code = code; throw error;
}

patientFlowRouter.get('/admissions', async (req, res, next) => {
  try {
    const org = tenantId(req);
    const status = req.query.status ? z.enum(['admitted', 'discharged']).parse(req.query.status) : undefined;
    const filter: Record<string, unknown> = { organizationId: org };
    if (status) filter.status = status;
    const rows = await Admission.find(filter)
      .populate('patientId', 'medicalRecordNumber firstName lastName dateOfBirth')
      .populate({ path: 'bedId', select: 'label status wardId', populate: { path: 'wardId', select: 'name code' } })
      .populate('facilityId', 'name code').sort({ admittedAt: -1 }).limit(100).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

patientFlowRouter.get('/admissions/:admissionId/events', async (req, res, next) => {
  try {
    const admissionId = idSchema.parse(req.params.admissionId), org = tenantId(req);
    const exists = await Admission.findOne({ _id: admissionId, organizationId: org }).select('_id').lean();
    if (!exists) fail(404, 'ADMISSION_NOT_FOUND', 'The admission was not found in this organization.');
    const events = await PatientFlowEvent.find({ admissionId, organizationId: org })
      .populate('actorId', 'firstName lastName email').sort({ occurredAt: 1 }).lean();
    res.json({ success: true, data: events });
  } catch (error) { next(error); }
});

patientFlowRouter.post('/admissions', writable, async (req, res, next) => {
  const parsed = admissionInput.safeParse(req.body);
  if (!parsed.success) { next(parsed.error); return; }
  const input = parsed.data, org = tenantId(req), session = await mongoose.startSession();
  try {
    let admissionId: Types.ObjectId | undefined;
    await session.withTransaction(async () => {
      const facility = await Facility.findOne({ _id: input.facilityId, organizationId: org, status: 'active' }).session(session).select('_id').lean();
      if (!facility) fail(404, 'FACILITY_NOT_FOUND', 'The active facility was not found in this organization.');
      const bed = await Bed.findOneAndUpdate(
        { _id: input.bedId, organizationId: org, facilityId: input.facilityId, status: 'available' },
        { $set: { status: 'occupied' } }, { new: true, session },
      ).select('_id wardId').lean();
      if (!bed) fail(409, 'BED_UNAVAILABLE', 'The selected bed is unavailable or does not belong to this facility.');
      const ward = await Ward.findOne({ _id: bed.wardId, organizationId: org, facilityId: input.facilityId, status: 'active' }).session(session).select('_id').lean();
      if (!ward) fail(409, 'WARD_INACTIVE', 'The selected bed is not in an active ward.');
      const mrn = normalizeMedicalRecordNumber(input.medicalRecordNumber);
      let patient = await Patient.findOne({ organizationId: org, medicalRecordNumber: mrn }).session(session);
      if (!patient) {
        const createdPatients = await Patient.create([{
          organizationId: org, medicalRecordNumber: mrn, firstName: input.firstName, lastName: input.lastName,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null, phone: input.phone,
        }], { session });
        if (!createdPatients[0]) fail(500, 'PATIENT_CREATE_FAILED', 'The patient record could not be created.');
        patient = createdPatients[0];
      } else if (patient.firstName.toLowerCase() !== input.firstName.toLowerCase() || patient.lastName.toLowerCase() !== input.lastName.toLowerCase()) {
        fail(409, 'PATIENT_IDENTITY_CONFLICT', 'The medical record number is already associated with a different patient identity.');
      }
      if (!patient) fail(500, 'PATIENT_CREATE_FAILED', 'The patient record could not be resolved.');
      const createdAdmissions = await Admission.create([{
        organizationId: org, facilityId: input.facilityId, patientId: patient._id, bedId: bed._id,
        admissionReason: input.admissionReason, createdBy: req.auth!.userId,
      }], { session });
      const admission = createdAdmissions[0];
      if (!admission) fail(500, 'ADMISSION_CREATE_FAILED', 'The admission could not be created.');
      admissionId = admission._id;
      await PatientFlowEvent.create([{
        organizationId: org, admissionId, patientId: patient._id, actorId: req.auth!.userId,
        type: 'admitted', toBedId: bed._id, note: input.admissionReason,
      }], { session });
    });
    const row = await Admission.findOne({ _id: admissionId, organizationId: org })
      .populate('patientId', 'medicalRecordNumber firstName lastName')
      .populate({ path: 'bedId', select: 'label status wardId', populate: { path: 'wardId', select: 'name code' } })
      .populate('facilityId', 'name code').lean();
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); } finally { await session.endSession(); }
});

patientFlowRouter.post('/admissions/:admissionId/transfer', writable, async (req, res, next) => {
  const parsed = transferInput.safeParse(req.body);
  if (!parsed.success) { next(parsed.error); return; }
  const { bedId, note = '' } = parsed.data, org = tenantId(req), session = await mongoose.startSession();
  try {
    const admissionId = idSchema.parse(req.params.admissionId);
    await session.withTransaction(async () => {
      const admission = await Admission.findOne({ _id: admissionId, organizationId: org, status: 'admitted' }).session(session);
      if (!admission || !canTransfer(admission.status)) fail(404, 'ACTIVE_ADMISSION_NOT_FOUND', 'An active admission was not found.');
      if (String(admission.bedId) === bedId) fail(400, 'SAME_BED', 'Choose a different destination bed.');
      const destination = await Bed.findOneAndUpdate(
        { _id: bedId, organizationId: org, facilityId: admission.facilityId, status: 'available' },
        { $set: { status: 'occupied' } }, { new: true, session },
      ).select('_id wardId').lean();
      if (!destination) fail(409, 'BED_UNAVAILABLE', 'The destination bed is unavailable or outside this facility.');
      const ward = await Ward.findOne({ _id: destination.wardId, organizationId: org, facilityId: admission.facilityId, status: 'active' }).session(session).select('_id').lean();
      if (!ward) fail(409, 'WARD_INACTIVE', 'The destination bed is not in an active ward.');
      const previousBedId = admission.bedId;
      const released = await Bed.updateOne({ _id: previousBedId, organizationId: org, status: 'occupied' }, { $set: { status: 'cleaning' } }, { session });
      if (released.modifiedCount !== 1) fail(409, 'SOURCE_BED_CONFLICT', 'The current bed state changed; refresh and retry.');
      admission.bedId = destination._id;
      await admission.save({ session });
      await PatientFlowEvent.create([{
        organizationId: org, admissionId, patientId: admission.patientId, actorId: req.auth!.userId,
        type: 'transferred', fromBedId: previousBedId, toBedId: destination._id, note,
      }], { session });
    });
    const row = await Admission.findOne({ _id: admissionId, organizationId: org })
      .populate('patientId', 'medicalRecordNumber firstName lastName')
      .populate({ path: 'bedId', select: 'label status wardId', populate: { path: 'wardId', select: 'name code' } }).lean();
    res.json({ success: true, data: row });
  } catch (error) { next(error); } finally { await session.endSession(); }
});

patientFlowRouter.post('/admissions/:admissionId/discharge', writable, async (req, res, next) => {
  const parsed = dischargeInput.safeParse(req.body);
  if (!parsed.success) { next(parsed.error); return; }
  const org = tenantId(req), session = await mongoose.startSession();
  try {
    const admissionId = idSchema.parse(req.params.admissionId);
    await session.withTransaction(async () => {
      const admission = await Admission.findOne({ _id: admissionId, organizationId: org, status: 'admitted' }).session(session);
      if (!admission || !canDischarge(admission.status)) fail(404, 'ACTIVE_ADMISSION_NOT_FOUND', 'An active admission was not found.');
      const released = await Bed.updateOne({ _id: admission.bedId, organizationId: org, status: 'occupied' }, { $set: { status: 'cleaning' } }, { session });
      if (released.modifiedCount !== 1) fail(409, 'BED_STATE_CONFLICT', 'The assigned bed is not occupied; refresh and review before discharge.');
      admission.status = 'discharged'; admission.dischargedAt = new Date(); admission.dischargedBy = new Types.ObjectId(req.auth!.userId);
      await admission.save({ session });
      await PatientFlowEvent.create([{
        organizationId: org, admissionId, patientId: admission.patientId, actorId: req.auth!.userId,
        type: 'discharged', fromBedId: admission.bedId, note: parsed.data.note || '',
      }], { session });
    });
    const row = await Admission.findOne({ _id: admissionId, organizationId: org })
      .populate('patientId', 'medicalRecordNumber firstName lastName').populate('bedId', 'label status').lean();
    res.json({ success: true, data: row });
  } catch (error) { next(error); } finally { await session.endSession(); }
});
