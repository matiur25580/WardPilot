export type ShiftWindow = { startAt: Date | string; endAt: Date | string };

export function overlapsShift(existing: ShiftWindow, proposed: ShiftWindow): boolean {
  return new Date(existing.startAt).getTime() < new Date(proposed.endAt).getTime()
    && new Date(existing.endAt).getTime() > new Date(proposed.startAt).getTime();
}

export function isValidShiftWindow(startAt: Date | string, endAt: Date | string, maxHours = 16): boolean {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= maxHours * 3_600_000;
}

export function nextStockBalance(current: number, quantityChange: number): number | null {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(quantityChange) || quantityChange === 0) return null;
  const next = current + quantityChange;
  return Number.isSafeInteger(next) && next >= 0 ? next : null;
}

export function isBelowReorderPoint(onHand: number, reorderPoint: number): boolean {
  return onHand <= reorderPoint;
}
