import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/auth.middleware';
import { Bed, Building, Department, Facility, Ward } from '../models/resource.model';
import { assertBedStatusTransition, bedStatuses } from '../services/bed-status';

export const resourceRouter = Router();
resourceRouter.use(authenticate);

const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'A valid resource ID is required.');
const codeSchema = z.string().trim().min(2).max(24).regex(/^[a-zA-Z0-9-]+$/).transform((v) => v.toUpperCase());
const nameSchema = z.string().trim().min(2).max(140);
const facilityInput = z.object({
  name: nameSchema,
  code: codeSchema,
  type: z.enum(['hospital', 'clinic', 'urgent_care', 'specialty_center']).default('hospital'),
  address: z.object({
    line1: z.string().trim().min(2).max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().min(2).max(80),
    region: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().trim().min(2).max(80),
  }),
  timezone: z.string().trim().min(3).max(64).default('Asia/Kolkata'),
});
const departmentInput = z.object({ facilityId: idSchema, name: nameSchema.max(100), code: codeSchema, description: z.string().trim().max(500).optional() });
const buildingInput = z.object({ facilityId: idSchema, name: nameSchema.max(100), code: codeSchema, floors: z.number().int().min(1).max(200) });
const wardInput = z.object({
  facilityId: idSchema, buildingId: idSchema, departmentId: idSchema.optional(), name: nameSchema.max(100), code: codeSchema,
  floor: z.number().int().min(0).max(200), careType: z.enum(['general', 'icu', 'emergency', 'maternity', 'pediatric', 'surgical', 'isolation', 'other']).default('general'),
});
const bedInput = z.object({ facilityId: idSchema, wardId: idSchema, label: z.string().trim().min(1).max(32), bedType: z.enum(['standard', 'icu', 'isolation', 'bariatric', 'pediatric']).default('standard') });

function tenantId(req: Express.Request): Types.ObjectId {
  return new Types.ObjectId(req.auth!.organizationId);
}
function fail(status: number, code: string, message: string): never {
  const error = new Error(message) as Error & { status: number; code: string };
  error.status = status; error.code = code; throw error;
}
async function scopedFacility(facilityId: string, organizationId: Types.ObjectId) {
  const facility = await Facility.findOne({ _id: facilityId, organizationId, status: 'active' }).select('_id').lean();
  if (!facility) fail(404, 'FACILITY_NOT_FOUND', 'The facility was not found in this organization.');
  return facility;
}

resourceRouter.get('/facilities', async (req, res, next) => {
  try {
    const rows = await Facility.find({ organizationId: tenantId(req) }).sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
resourceRouter.post('/facilities', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const input = facilityInput.parse(req.body);
    const row = await Facility.create({ ...input, organizationId: tenantId(req) });
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});

resourceRouter.get('/departments', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { organizationId: tenantId(req) };
    if (req.query.facilityId) filter.facilityId = idSchema.parse(req.query.facilityId);
    const rows = await Department.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
resourceRouter.post('/departments', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const input = departmentInput.parse(req.body); const org = tenantId(req);
    await scopedFacility(input.facilityId, org);
    const row = await Department.create({ ...input, organizationId: org });
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});

resourceRouter.get('/buildings', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { organizationId: tenantId(req) };
    if (req.query.facilityId) filter.facilityId = idSchema.parse(req.query.facilityId);
    const rows = await Building.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
resourceRouter.post('/buildings', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const input = buildingInput.parse(req.body); const org = tenantId(req);
    await scopedFacility(input.facilityId, org);
    const row = await Building.create({ ...input, organizationId: org });
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});

resourceRouter.get('/wards', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { organizationId: tenantId(req) };
    if (req.query.facilityId) filter.facilityId = idSchema.parse(req.query.facilityId);
    const rows = await Ward.find(filter).populate('buildingId', 'name code').populate('departmentId', 'name code').sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
resourceRouter.post('/wards', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const input = wardInput.parse(req.body); const org = tenantId(req);
    await scopedFacility(input.facilityId, org);
    const building = await Building.findOne({ _id: input.buildingId, facilityId: input.facilityId, organizationId: org, status: 'active' }).select('_id floors').lean();
    if (!building) fail(404, 'BUILDING_NOT_FOUND', 'The building was not found in this facility.');
    if (input.floor >= building.floors) fail(400, 'INVALID_FLOOR', 'The selected floor is outside this building.');
    if (input.departmentId) {
      const department = await Department.findOne({ _id: input.departmentId, facilityId: input.facilityId, organizationId: org, status: 'active' }).select('_id').lean();
      if (!department) fail(404, 'DEPARTMENT_NOT_FOUND', 'The department was not found in this facility.');
    }
    const row = await Ward.create({ ...input, organizationId: org, departmentId: input.departmentId || null });
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});

resourceRouter.get('/beds', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { organizationId: tenantId(req) };
    if (req.query.facilityId) filter.facilityId = idSchema.parse(req.query.facilityId);
    if (req.query.wardId) filter.wardId = idSchema.parse(req.query.wardId);
    if (req.query.status) filter.status = z.enum(bedStatuses).parse(req.query.status);
    const rows = await Bed.find(filter).populate('wardId', 'name code careType').sort({ label: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
resourceRouter.post('/beds', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const input = bedInput.parse(req.body); const org = tenantId(req);
    await scopedFacility(input.facilityId, org);
    const ward = await Ward.findOne({ _id: input.wardId, facilityId: input.facilityId, organizationId: org, status: 'active' }).select('_id').lean();
    if (!ward) fail(404, 'WARD_NOT_FOUND', 'The ward was not found in this facility.');
    const row = await Bed.create({ ...input, organizationId: org, status: 'available' });
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});
resourceRouter.patch('/beds/:bedId/status', requireRoles('owner', 'admin', 'manager', 'staff'), async (req, res, next) => {
  try {
    const bedId = idSchema.parse(req.params.bedId);
    const { status } = z.object({ status: z.enum(bedStatuses) }).parse(req.body);
    const org = tenantId(req);
    const bed = await Bed.findOne({ _id: bedId, organizationId: org });
    if (!bed) fail(404, 'BED_NOT_FOUND', 'The bed was not found in this organization.');
    assertBedStatusTransition(bed.status, status);
    bed.status = status;
    await bed.save();
    res.json({ success: true, data: bed });
  } catch (error) { next(error); }
});
