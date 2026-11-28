import { describe, expect, it } from 'vitest';
import { isBelowReorderPoint, isValidShiftWindow, nextStockBalance, overlapsShift } from './operations.rules';

describe('workforce scheduling rules', () => {
  it('detects overlapping shifts but allows adjacent handovers', () => {
    const existing = { startAt: '2026-11-27T08:00:00.000Z', endAt: '2026-11-27T16:00:00.000Z' };
    expect(overlapsShift(existing, { startAt: '2026-11-27T15:00:00.000Z', endAt: '2026-11-27T23:00:00.000Z' })).toBe(true);
    expect(overlapsShift(existing, { startAt: '2026-11-27T16:00:00.000Z', endAt: '2026-11-28T00:00:00.000Z' })).toBe(false);
  });
  it('rejects invalid or excessively long shifts', () => {
    expect(isValidShiftWindow('2026-11-27T08:00:00.000Z', '2026-11-27T16:00:00.000Z')).toBe(true);
    expect(isValidShiftWindow('2026-11-27T08:00:00.000Z', '2026-11-28T02:00:00.000Z')).toBe(false);
    expect(isValidShiftWindow('2026-11-27T16:00:00.000Z', '2026-11-27T08:00:00.000Z')).toBe(false);
  });
});
describe('inventory ledger rules', () => {
  it('prevents negative stock and unsafe integer balances', () => {
    expect(nextStockBalance(10, -4)).toBe(6);
    expect(nextStockBalance(3, -4)).toBeNull();
    expect(nextStockBalance(Number.MAX_SAFE_INTEGER, 1)).toBeNull();
  });
  it('flags stock at or below the reorder point', () => {
    expect(isBelowReorderPoint(5, 5)).toBe(true);
    expect(isBelowReorderPoint(6, 5)).toBe(false);
  });
});
