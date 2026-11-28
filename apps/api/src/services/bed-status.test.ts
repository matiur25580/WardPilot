import { describe, expect, it } from 'vitest';
import { canTransitionBedStatus } from './bed-status';

describe('bed status transitions', () => {
  it('allows clinically sensible operational transitions', () => {
    expect(canTransitionBedStatus('available', 'occupied')).toBe(true);
    expect(canTransitionBedStatus('occupied', 'cleaning')).toBe(true);
    expect(canTransitionBedStatus('cleaning', 'available')).toBe(true);
    expect(canTransitionBedStatus('reserved', 'available')).toBe(true);
  });

  it('rejects skipping cleaning after occupancy and no-op changes', () => {
    expect(canTransitionBedStatus('occupied', 'available')).toBe(false);
    expect(canTransitionBedStatus('occupied', 'reserved')).toBe(false);
    expect(canTransitionBedStatus('available', 'available')).toBe(false);
  });
});
