export type AdmissionStatus = 'admitted' | 'discharged';

export function canDischarge(status: AdmissionStatus): boolean {
  return status === 'admitted';
}

export function canTransfer(status: AdmissionStatus): boolean {
  return status === 'admitted';
}

export function normalizeMedicalRecordNumber(value: string): string {
  return value.trim().toUpperCase();
}
