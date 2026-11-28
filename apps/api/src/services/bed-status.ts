export const bedStatuses = ['available', 'reserved', 'occupied', 'cleaning', 'maintenance'] as const;
export type BedStatus = (typeof bedStatuses)[number];

const allowedTransitions: Record<BedStatus, readonly BedStatus[]> = {
  available: ['reserved', 'occupied', 'cleaning', 'maintenance'],
  reserved: ['available', 'occupied'],
  occupied: ['cleaning'],
  cleaning: ['available', 'maintenance'],
  maintenance: ['cleaning', 'available'],
};

export function canTransitionBedStatus(from: BedStatus, to: BedStatus): boolean {
  return from !== to && allowedTransitions[from].includes(to);
}

export function assertBedStatusTransition(from: BedStatus, to: BedStatus): void {
  if (!canTransitionBedStatus(from, to)) {
    const error = new Error(`Bed status cannot transition from "${from}" to "${to}".`) as Error & { status: number; code: string };
    error.status = 409;
    error.code = 'INVALID_BED_STATUS_TRANSITION';
    throw error;
  }
}
