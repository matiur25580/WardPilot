export const bedStatusKeys = ['available', 'reserved', 'occupied', 'cleaning', 'maintenance'] as const;
export type BedStatusKey = (typeof bedStatusKeys)[number];
export type BedStatusCounts = Record<BedStatusKey, number>;

export function summarizeBedStatuses(rows: Array<{ _id: string; count: number }>) {
  const beds: BedStatusCounts = { available: 0, reserved: 0, occupied: 0, cleaning: 0, maintenance: 0 };
  for (const row of rows) {
    if (bedStatusKeys.includes(row._id as BedStatusKey)) beds[row._id as BedStatusKey] = row.count;
  }
  const total = Object.values(beds).reduce((sum, count) => sum + count, 0);
  return { beds, total, occupancyRate: total === 0 ? 0 : Math.round((beds.occupied / total) * 1000) / 10 };
}

export function buildOperationalAlerts(input: {
  totalBeds: number; occupancyRate: number; lowStockItems: number; outOfStockItems: number; maintenanceBeds: number;
}) {
  const alerts: Array<{ code: string; severity: 'critical' | 'warning' | 'info'; message: string }> = [];
  if (input.totalBeds === 0) alerts.push({ code: 'NO_BED_CAPACITY', severity: 'info', message: 'No beds are registered in this reporting scope.' });
  if (input.occupancyRate >= 90) alerts.push({ code: 'HIGH_OCCUPANCY', severity: 'critical', message: 'Bed occupancy is at or above 90% of registered capacity.' });
  if (input.outOfStockItems > 0) alerts.push({ code: 'OUT_OF_STOCK', severity: 'critical', message: `${input.outOfStockItems} inventory item(s) have zero on-hand stock.` });
  else if (input.lowStockItems > 0) alerts.push({ code: 'LOW_STOCK', severity: 'warning', message: `${input.lowStockItems} inventory item(s) are at or below their reorder point.` });
  if (input.maintenanceBeds > 0) alerts.push({ code: 'BEDS_IN_MAINTENANCE', severity: 'info', message: `${input.maintenanceBeds} bed(s) are currently marked for maintenance.` });
  return alerts;
}
