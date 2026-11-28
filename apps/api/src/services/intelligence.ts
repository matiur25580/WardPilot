import { Types } from 'mongoose';
import { Admission } from '../models/patient-flow.model';
import { Bed, Facility } from '../models/resource.model';
import { StaffShift } from '../models/staffing.model';
import { InventoryItem } from '../models/inventory.model';
import { buildOperationalAlerts, summarizeBedStatuses } from './intelligence.rules';

export class IntelligenceError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}
function fail(status: number, code: string, message: string): never {
  throw new IntelligenceError(status, code, message);
}

export async function getOperationalOverview(org: string, filters: { facilityId?: string; from?: string; to?: string }) {
  if (!Types.ObjectId.isValid(org)) fail(401, 'INVALID_TENANT_CONTEXT', 'An authenticated organization context is required.');
  const organizationId = new Types.ObjectId(org);
  const now = new Date();
  const to = filters.to ? new Date(filters.to) : now;
  const from = filters.from ? new Date(filters.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    fail(400, 'INVALID_REPORTING_WINDOW', 'The reporting window must have a valid start before its end.');
  }
  if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
    fail(400, 'REPORTING_WINDOW_TOO_LARGE', 'Operational summaries are limited to a maximum 90-day reporting window.');
  }
  let facilityId: Types.ObjectId | undefined;
  if (filters.facilityId) {
    if (!Types.ObjectId.isValid(filters.facilityId)) fail(400, 'INVALID_FACILITY_ID', 'A valid facility identifier is required.');
    const facility = await Facility.findOne({ _id: filters.facilityId, organizationId, status: 'active' }).select('_id name code').lean();
    if (!facility) fail(404, 'FACILITY_NOT_FOUND', 'The active facility was not found in this organization.');
    facilityId = facility._id;
  }
  const scope: Record<string, unknown> = { organizationId, ...(facilityId ? { facilityId } : {}) };
  const [bedRows, activeAdmissions, admissionsInWindow, dischargesInWindow, lengthOfStay, shiftRows, activeInventoryItems, lowStockItems, outOfStockItems] = await Promise.all([
    Bed.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Admission.countDocuments({ ...scope, status: 'admitted' }),
    Admission.countDocuments({ ...scope, admittedAt: { $gte: from, $lt: to } }),
    Admission.countDocuments({ ...scope, status: 'discharged', dischargedAt: { $gte: from, $lt: to } }),
    Admission.aggregate([
      { $match: { ...scope, status: 'discharged', dischargedAt: { $gte: from, $lt: to }, admittedAt: { $lte: to } } },
      { $group: { _id: null, averageHours: { $avg: { $divide: [{ $subtract: ['$dischargedAt', '$admittedAt'] }, 3_600_000] } } } },
    ]),
    StaffShift.aggregate([
      { $match: { ...scope, startAt: { $lt: to }, endAt: { $gt: from } } },
      { $group: { _id: '$status', count: { $sum: 1 }, staffIds: { $addToSet: '$userId' } } },
    ]),
    InventoryItem.countDocuments({ ...scope, status: 'active' }),
    InventoryItem.countDocuments({ ...scope, status: 'active', $expr: { $lte: ['$onHand', '$reorderPoint'] } }),
    InventoryItem.countDocuments({ ...scope, status: 'active', onHand: 0 }),
  ]);
  const capacity = summarizeBedStatuses(bedRows);
  const shifts = { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0 };
  const staffIds = new Set<string>();
  for (const row of shiftRows as Array<{ _id: keyof typeof shifts; count: number; staffIds: Types.ObjectId[] }>) {
    if (row._id in shifts) shifts[row._id] = row.count;
    for (const id of row.staffIds) staffIds.add(String(id));
  }
  const averageLengthOfStayHours = Number.isFinite(lengthOfStay[0]?.averageHours)
    ? Math.round(lengthOfStay[0].averageHours * 10) / 10 : null;
  const alerts = buildOperationalAlerts({
    totalBeds: capacity.total, occupancyRate: capacity.occupancyRate,
    lowStockItems, outOfStockItems, maintenanceBeds: capacity.beds.maintenance,
  });
  return {
    generatedAt: now.toISOString(),
    window: { from: from.toISOString(), to: to.toISOString(), days: Math.ceil((to.getTime() - from.getTime()) / 86_400_000) },
    scope: { facilityId: facilityId ? String(facilityId) : null },
    capacity: { ...capacity, availableRate: capacity.total ? Math.round((capacity.beds.available / capacity.total) * 1000) / 10 : 0 },
    patientFlow: { activeAdmissions, admissionsInWindow, dischargesInWindow, averageLengthOfStayHours },
    workforce: { shifts, uniqueStaffScheduled: staffIds.size },
    inventory: { activeItems: activeInventoryItems, lowStockItems, outOfStockItems },
    alerts,
    privacy: { patientIdentifiableInformationIncluded: false },
  };
}
