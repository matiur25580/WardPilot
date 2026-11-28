import mongoose, { Types } from 'mongoose';
import { Department, Facility } from '../models/resource.model';
import { Membership } from '../models/membership.model';
import { InventoryItem, InventoryMovement } from '../models/inventory.model';
import { StaffScheduleLock, StaffShift, StaffShiftEvent } from '../models/staffing.model';
import { isValidShiftWindow, nextStockBalance } from './operations.rules';
import { recordAuditEvent } from './audit';

export class OperationsError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
function fail(status: number, code: string, message: string): never { throw new OperationsError(status, code, message); }
const validId = (id: string) => Types.ObjectId.isValid(id);

export async function createStaffShift(org: string, actor: string, input: {
  facilityId: string; departmentId?: string; userId: string; shiftType: string; roleLabel?: string;
  startAt: string; endAt: string; notes?: string;
}) {
  if (!validId(input.facilityId) || !validId(input.userId) || (input.departmentId && !validId(input.departmentId))) fail(400, 'INVALID_SHIFT_REFERENCE', 'A facility, staff member or department identifier is invalid.');
  if (!isValidShiftWindow(input.startAt, input.endAt)) fail(400, 'INVALID_SHIFT_WINDOW', 'A shift must have a positive duration no longer than 16 hours.');
  const session = await mongoose.startSession();
  let shiftId: Types.ObjectId | undefined;
  try {
    await session.withTransaction(async () => {
      const facility = await Facility.findOne({ _id: input.facilityId, organizationId: org, status: 'active' }).select('_id').session(session).lean();
      const member = await Membership.findOne({ userId: input.userId, organizationId: org, status: 'active', role: { $in: ['owner', 'admin', 'manager', 'staff'] } }).select('_id').session(session).lean();
      if (!facility) fail(404, 'FACILITY_NOT_FOUND', 'The active facility was not found in this organization.');
      if (!member) fail(400, 'STAFF_MEMBER_INVALID', 'The assigned staff member must have an active non-viewer membership in this organization.');
      if (input.departmentId) {
        const department = await Department.findOne({ _id: input.departmentId, organizationId: org, facilityId: input.facilityId, status: 'active' }).select('_id').session(session).lean();
        if (!department) fail(400, 'DEPARTMENT_INVALID', 'The department must be active and belong to the selected facility.');
      }
      await StaffScheduleLock.findOneAndUpdate(
        { organizationId: org, userId: input.userId },
        { $inc: { version: 1 }, $setOnInsert: { organizationId: org, userId: input.userId } },
        { upsert: true, new: true, session, setDefaultsOnInsert: true }
      );
      const overlap = await StaffShift.findOne({
        organizationId: org, userId: input.userId, status: { $in: ['scheduled', 'confirmed'] },
        startAt: { $lt: new Date(input.endAt) }, endAt: { $gt: new Date(input.startAt) }
      }).select('_id').session(session).lean();
      if (overlap) fail(409, 'STAFF_SHIFT_OVERLAP', 'This staff member already has a scheduled or confirmed shift during the selected time.');
      const [created] = await StaffShift.create([{
        organizationId: org, facilityId: input.facilityId, ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        userId: input.userId, shiftType: input.shiftType, roleLabel: input.roleLabel ?? '',
        startAt: new Date(input.startAt), endAt: new Date(input.endAt), notes: input.notes ?? '',
        createdBy: actor, updatedBy: actor
      }], { session });
      if (!created) fail(500, 'SHIFT_CREATE_FAILED', 'The staff shift could not be created.');
      shiftId = created._id;
      await StaffShiftEvent.create([{
        organizationId: org, shiftId: created._id, actorId: actor, action: 'created',
        details: { userId: input.userId, facilityId: input.facilityId, startAt: input.startAt, endAt: input.endAt }
      }], { session });
      await recordAuditEvent({ organizationId: org, actorId: actor, action: 'staff_shift.created', entityType: 'staff_shift', entityId: created._id, facilityId: input.facilityId, summary: 'Staff shift created.', details: { shiftType: input.shiftType, startAt: input.startAt, endAt: input.endAt } }, session);
    });
  } finally { await session.endSession(); }
  if (!shiftId) fail(500, 'SHIFT_CREATE_FAILED', 'The staff shift could not be created.');
  return StaffShift.findOne({ _id: shiftId, organizationId: org }).populate('userId', 'firstName lastName email').populate('facilityId', 'name code').populate('departmentId', 'name code').lean();
}

export async function listStaffShifts(org: string, filters: { facilityId?: string; from?: string; to?: string; status?: string }) {
  const query: Record<string, unknown> = { organizationId: org };
  if (filters.facilityId) query.facilityId = filters.facilityId;
  if (filters.status) query.status = filters.status;
  if (filters.from) query.endAt = { $gt: new Date(filters.from) };
  if (filters.to) query.startAt = { $lt: new Date(filters.to) };
  return StaffShift.find(query).populate('userId', 'firstName lastName email').populate('facilityId', 'name code').populate('departmentId', 'name code').sort({ startAt: 1 }).limit(200).lean();
}

export async function transitionStaffShift(org: string, actor: string, id: string, status: 'confirmed' | 'completed' | 'cancelled') {
  if (!validId(id)) fail(400, 'INVALID_SHIFT_ID', 'A valid shift identifier is required.');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const shift = await StaffShift.findOne({ _id: id, organizationId: org }).session(session);
      if (!shift) fail(404, 'SHIFT_NOT_FOUND', 'The shift was not found in this organization.');
      const previous = shift.status;
      const allowed = (previous === 'scheduled' && ['confirmed', 'cancelled'].includes(status))
        || (previous === 'confirmed' && ['completed', 'cancelled'].includes(status));
      if (!allowed) fail(409, 'INVALID_SHIFT_TRANSITION', `A shift cannot move from ${previous} to ${status}.`);
      if (status === 'completed' && shift.endAt > new Date()) fail(409, 'SHIFT_NOT_FINISHED', 'A shift cannot be completed before its scheduled end time.');
      shift.status = status;
      shift.updatedBy = new Types.ObjectId(actor);
      if (status === 'confirmed') shift.confirmedAt = new Date();
      if (status === 'completed') shift.completedAt = new Date();
      if (status === 'cancelled') shift.cancelledAt = new Date();
      await shift.save({ session });
      await StaffShiftEvent.create([{
        organizationId: org, shiftId: shift._id, actorId: actor, action: status, details: { from: previous, to: status }
      }], { session });
      await recordAuditEvent({ organizationId: org, actorId: actor, action: 'staff_shift.status_changed', entityType: 'staff_shift', entityId: shift._id, facilityId: shift.facilityId, summary: `Staff shift changed from ${previous} to ${status}.`, details: { fromStatus: previous, toStatus: status } }, session);
    });
  } finally { await session.endSession(); }
  return StaffShift.findOne({ _id: id, organizationId: org }).populate('userId', 'firstName lastName email').populate('facilityId', 'name code').populate('departmentId', 'name code').lean();
}

export async function createInventoryItem(org: string, actor: string, input: {
  facilityId: string; itemCode: string; name: string; category: string; unit: string; reorderPoint: number; parLevel: number;
}) {
  if (!validId(input.facilityId)) fail(400, 'INVALID_FACILITY_ID', 'A valid facility identifier is required.');
  const facility = await Facility.findOne({ _id: input.facilityId, organizationId: org, status: 'active' }).select('_id').lean();
  if (!facility) fail(404, 'FACILITY_NOT_FOUND', 'The active facility was not found in this organization.');
  if (input.parLevel < input.reorderPoint) fail(400, 'INVALID_STOCK_LEVELS', 'Par level must be greater than or equal to the reorder point.');
  const item = await InventoryItem.create({
    ...input, itemCode: input.itemCode.toUpperCase(), organizationId: org,
    onHand: 0, createdBy: actor, updatedBy: actor
  });
  await recordAuditEvent({ organizationId: org, actorId: actor, action: 'inventory_item.created', entityType: 'inventory_item', entityId: item._id, facilityId: item.facilityId, summary: `Inventory item ${item.itemCode} created.`, details: { itemCode: item.itemCode } });
  return item;
}

export async function listInventoryItems(org: string, filters: { facilityId?: string; lowStock?: boolean }) {
  const query: Record<string, unknown> = { organizationId: org, status: 'active' };
  if (filters.facilityId) query.facilityId = filters.facilityId;
  if (filters.lowStock) query.$expr = { $lte: ['$onHand', '$reorderPoint'] };
  return InventoryItem.find(query).populate('facilityId', 'name code').sort({ facilityId: 1, name: 1 }).limit(300).lean();
}

export async function recordInventoryMovement(org: string, actor: string, itemId: string, input: {
  type: 'receive' | 'consume' | 'adjust'; quantityChange: number; reason: string; reference?: string; idempotencyKey: string;
}) {
  if (!validId(itemId)) fail(400, 'INVALID_INVENTORY_ITEM_ID', 'A valid inventory item identifier is required.');
  if (!Number.isSafeInteger(input.quantityChange) || input.quantityChange === 0
    || (input.type === 'receive' && input.quantityChange < 0)
    || (input.type === 'consume' && input.quantityChange > 0)) {
    fail(400, 'INVALID_STOCK_MOVEMENT', 'Receive movements must be positive, consume movements negative, and adjustments non-zero integers.');
  }
  const prior = await InventoryMovement.findOne({ organizationId: org, idempotencyKey: input.idempotencyKey }).lean();
  if (prior) {
    if (String(prior.itemId) !== itemId || prior.type !== input.type || prior.quantityChange !== input.quantityChange || prior.reason !== input.reason) {
      fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different stock movement.');
    }
    return prior;
  }
  const session = await mongoose.startSession();
  let movementId: Types.ObjectId | undefined;
  try {
    await session.withTransaction(async () => {
      const item = await InventoryItem.findOne({ _id: itemId, organizationId: org, status: 'active' }).session(session);
      if (!item) fail(404, 'INVENTORY_ITEM_NOT_FOUND', 'The inventory item was not found in this organization.');
      const balance = nextStockBalance(item.onHand, input.quantityChange);
      if (balance === null) fail(409, 'INSUFFICIENT_STOCK', 'The movement would result in a negative or invalid stock balance.');
      const updated = await InventoryItem.findOneAndUpdate(
        { _id: item._id, organizationId: org, onHand: item.onHand, status: 'active' },
        { $inc: { onHand: input.quantityChange }, $set: { updatedBy: actor } },
        { new: true, session, runValidators: true }
      );
      if (!updated) fail(409, 'INVENTORY_CONCURRENT_UPDATE', 'Stock changed during this request. Reload and retry.');
      const [movement] = await InventoryMovement.create([{
        organizationId: org, facilityId: item.facilityId, itemId: item._id, type: input.type,
        quantityChange: input.quantityChange, balanceAfter: balance, reason: input.reason,
        reference: input.reference ?? '', idempotencyKey: input.idempotencyKey, actorId: actor
      }], { session });
      if (!movement) fail(500, 'INVENTORY_MOVEMENT_FAILED', 'The stock movement could not be recorded.');
      await recordAuditEvent({ organizationId: org, actorId: actor, action: 'inventory.movement_recorded', entityType: 'inventory_movement', entityId: movement._id, facilityId: item.facilityId, summary: `Inventory ${input.type} movement recorded for ${item.itemCode}.`, details: { itemCode: item.itemCode, quantityChange: input.quantityChange, balanceAfter: balance } }, session);
      movementId = movement._id;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000) {
      const duplicate = await InventoryMovement.findOne({ organizationId: org, idempotencyKey: input.idempotencyKey }).lean();
      if (duplicate) {
        if (String(duplicate.itemId) !== itemId || duplicate.type !== input.type || duplicate.quantityChange !== input.quantityChange || duplicate.reason !== input.reason) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different stock movement.');
        return duplicate;
      }
    }
    throw error;
  } finally { await session.endSession(); }
  return InventoryMovement.findOne({ _id: movementId, organizationId: org }).lean();
}

export async function listInventoryMovements(org: string, itemId: string) {
  if (!validId(itemId)) fail(400, 'INVALID_INVENTORY_ITEM_ID', 'A valid inventory item identifier is required.');
  const exists = await InventoryItem.exists({ _id: itemId, organizationId: org });
  if (!exists) fail(404, 'INVENTORY_ITEM_NOT_FOUND', 'The inventory item was not found in this organization.');
  return InventoryMovement.find({ organizationId: org, itemId }).populate('actorId', 'firstName lastName email').sort({ createdAt: -1 }).limit(100).lean();
}
