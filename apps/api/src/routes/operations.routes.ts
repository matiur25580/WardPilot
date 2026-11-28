import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/auth.middleware';
import {
  createInventoryItem, createStaffShift, listInventoryItems, listInventoryMovements,
  listStaffShifts, recordInventoryMovement, transitionStaffShift
} from '../services/operations';

export const operationsRouter = Router();
operationsRouter.use(authenticate);

const id = z.string().regex(/^[a-f\d]{24}$/i);
const dateTime = z.string().datetime({ offset: true });
const shiftSchema = z.object({
  facilityId: id, departmentId: id.optional(), userId: id,
  shiftType: z.enum(['day', 'evening', 'night', 'on_call']),
  roleLabel: z.string().trim().max(100).optional().default(''),
  startAt: dateTime, endAt: dateTime, notes: z.string().trim().max(500).optional().default('')
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(value.startAt), end = Date.parse(value.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 16 * 60 * 60 * 1000) {
    ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'Shift duration must be positive and no longer than 16 hours.' });
  }
});
const shiftListSchema = z.object({
  facilityId: id.optional(), from: dateTime.optional(), to: dateTime.optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled']).optional()
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to && Date.parse(value.to) < Date.parse(value.from)) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'End of range must not be before its start.' });
  }
});
const shiftStatusSchema = z.object({ status: z.enum(['confirmed', 'completed', 'cancelled']) }).strict();

const inventorySchema = z.object({
  facilityId: id, itemCode: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  category: z.enum(['medical_supply', 'ppe', 'consumable', 'equipment', 'pharmacy_stock', 'other']),
  unit: z.string().trim().min(1).max(24),
  reorderPoint: z.number().int().min(0).max(100000000),
  parLevel: z.number().int().min(0).max(100000000)
}).strict().superRefine((value, ctx) => {
  if (value.parLevel < value.reorderPoint) ctx.addIssue({ code: 'custom', path: ['parLevel'], message: 'Par level must be at least the reorder point.' });
});
const movementSchema = z.object({
  type: z.enum(['receive', 'consume', 'adjust']),
  quantityChange: z.number().int().min(-100000000).max(100000000).refine(value => value !== 0),
  reason: z.string().trim().min(5).max(500),
  reference: z.string().trim().max(120).optional().default(''),
  idempotencyKey: z.string().trim().min(12).max(120)
}).strict().superRefine((value, ctx) => {
  if (value.type === 'receive' && value.quantityChange < 0) ctx.addIssue({ code: 'custom', path: ['quantityChange'], message: 'Receive quantity must be positive.' });
  if (value.type === 'consume' && value.quantityChange > 0) ctx.addIssue({ code: 'custom', path: ['quantityChange'], message: 'Consume quantity must be negative.' });
});

operationsRouter.get('/shifts', async (req, res, next) => {
  try {
    const filters = shiftListSchema.parse(req.query);
    const rows = await listStaffShifts(req.auth!.organizationId, filters);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
operationsRouter.post('/shifts', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const input = shiftSchema.parse(req.body);
    const row = await createStaffShift(req.auth!.organizationId, req.auth!.userId, input);
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});
operationsRouter.patch('/shifts/:shiftId/status', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const { status } = shiftStatusSchema.parse(req.body);
    const row = await transitionStaffShift(req.auth!.organizationId, req.auth!.userId, String(req.params.shiftId ?? ''), status);
    res.json({ success: true, data: row });
  } catch (error) { next(error); }
});

operationsRouter.get('/inventory', async (req, res, next) => {
  try {
    const filters = z.object({ facilityId: id.optional(), lowStock: z.enum(['true', 'false']).optional() }).strict().parse(req.query);
    const rows = await listInventoryItems(req.auth!.organizationId, { ...(filters.facilityId ? { facilityId: filters.facilityId } : {}), lowStock: filters.lowStock === 'true' });
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
operationsRouter.post('/inventory', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const input = inventorySchema.parse(req.body);
    const row = await createInventoryItem(req.auth!.organizationId, req.auth!.userId, input);
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});
operationsRouter.get('/inventory/:itemId/movements', async (req, res, next) => {
  try {
    const rows = await listInventoryMovements(req.auth!.organizationId, String(req.params.itemId ?? ''));
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});
operationsRouter.post('/inventory/:itemId/movements', requireRoles('owner', 'admin', 'manager', 'staff'), async (req, res, next) => {
  try {
    const input = movementSchema.parse(req.body);
    const row = await recordInventoryMovement(req.auth!.organizationId, req.auth!.userId, String(req.params.itemId ?? ''), input);
    res.status(201).json({ success: true, data: row });
  } catch (error) { next(error); }
});
