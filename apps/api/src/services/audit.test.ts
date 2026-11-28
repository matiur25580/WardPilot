import {describe,expect,it} from 'vitest';
import {sanitizeAuditDetails} from './audit';
describe('audit metadata privacy boundary',()=>{
 it('keeps allow-listed operational fields and excludes patient-identifiable or clinical data',()=>{
  expect(sanitizeAuditDetails({fromStatus:'available',toStatus:'occupied',bedLabel:'A-01',patientName:'Private Patient',medicalRecordNumber:'MRN-SECRET',phone:'+910000000000',diagnosis:'private',quantityChange:-3,balanceAfter:7})).toEqual({fromStatus:'available',toStatus:'occupied',bedLabel:'A-01',quantityChange:-3,balanceAfter:7});
 });
 it('drops non-finite numbers and truncates strings',()=>{
  expect(sanitizeAuditDetails({itemCode:'X'.repeat(200),balanceAfter:Number.NaN,quantityChange:Infinity})).toEqual({itemCode:'X'.repeat(120)});
 });
});
