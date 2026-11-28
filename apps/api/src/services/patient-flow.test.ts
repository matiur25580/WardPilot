import { describe, expect, it } from 'vitest';
import { canDischarge, canTransfer, normalizeMedicalRecordNumber } from './patient-flow';

describe('patient flow lifecycle rules', () => {
  it('allows transfer and discharge only for active admissions', () => {
    expect(canTransfer('admitted')).toBe(true);
    expect(canDischarge('admitted')).toBe(true);
    expect(canTransfer('discharged')).toBe(false);
    expect(canDischarge('discharged')).toBe(false);
  });

  it('normalizes medical record numbers for tenant-scoped uniqueness', () => {
    expect(normalizeMedicalRecordNumber('  mrn-1001 ')).toBe('MRN-1001');
  });
});
