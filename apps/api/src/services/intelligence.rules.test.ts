import { describe, expect, it } from 'vitest';
import { buildOperationalAlerts, summarizeBedStatuses } from './intelligence.rules';

describe('operational intelligence rules', () => {
  it('summarizes all bed states and calculates occupancy from registered capacity', () => {
    expect(summarizeBedStatuses([
      { _id: 'available', count: 5 }, { _id: 'occupied', count: 3 },
      { _id: 'reserved', count: 1 }, { _id: 'cleaning', count: 1 },
    ])).toEqual({
      beds: { available: 5, reserved: 1, occupied: 3, cleaning: 1, maintenance: 0 },
      total: 10, occupancyRate: 30,
    });
  });

  it('returns a safe zero occupancy rate when no beds exist', () => {
    expect(summarizeBedStatuses([])).toMatchObject({ total: 0, occupancyRate: 0 });
  });

  it('raises deterministic alerts for capacity, stock and maintenance conditions', () => {
    expect(buildOperationalAlerts({
      totalBeds: 100, occupancyRate: 92.5, lowStockItems: 4, outOfStockItems: 2, maintenanceBeds: 3,
    })).toEqual([
      { code: 'HIGH_OCCUPANCY', severity: 'critical', message: 'Bed occupancy is at or above 90% of registered capacity.' },
      { code: 'OUT_OF_STOCK', severity: 'critical', message: '2 inventory item(s) have zero on-hand stock.' },
      { code: 'BEDS_IN_MAINTENANCE', severity: 'info', message: '3 bed(s) are currently marked for maintenance.' },
    ]);
  });

  it('reports low stock as a warning when no item is completely out of stock', () => {
    expect(buildOperationalAlerts({
      totalBeds: 20, occupancyRate: 50, lowStockItems: 2, outOfStockItems: 0, maintenanceBeds: 0,
    })).toEqual([{ code: 'LOW_STOCK', severity: 'warning', message: '2 inventory item(s) are at or below their reorder point.' }]);
  });
});
