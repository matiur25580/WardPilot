import { describe, expect, it } from 'vitest';
import { canTransitionBedStatus } from '../services/bed-status';

describe('resource registry invariants', () => {
  it('does not permit direct release of an occupied bed', () => {
    expect(canTransitionBedStatus('occupied', 'available')).toBe(false);
  });
  it('requires cleaning before an occupied bed becomes available', () => {
    expect(canTransitionBedStatus('occupied', 'cleaning')).toBe(true);
    expect(canTransitionBedStatus('cleaning', 'available')).toBe(true);
  });
  it('does not permit assigning a bed in maintenance', () => {
    expect(canTransitionBedStatus('maintenance', 'occupied')).toBe(false);
  });
});
