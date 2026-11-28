import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { app } from '../app';
import { signAccessToken } from '../auth/token.service';
import { Membership } from '../models/membership.model';
import { Organization } from '../models/organization.model';
import { RefreshSession } from '../models/refresh-session.model';
import { User } from '../models/user.model';
import { Admission, Patient, PatientFlowEvent } from '../models/patient-flow.model';
import { Bed, Building, Facility, Ward } from '../models/resource.model';

const mongoUri = process.env.MONGODB_URI;
const integrationDescribe = mongoUri && process.env.WARDPILOT_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

integrationDescribe('patient-flow HTTP integration (replica-set MongoDB)', () => {
  let organizationId: Types.ObjectId;
  let otherOrganizationId: Types.ObjectId;
  let facilityId: Types.ObjectId;
  let firstBedId: Types.ObjectId;
  let secondBedId: Types.ObjectId;
  let accessToken: string;
  let otherAccessToken: string;

  beforeAll(async () => {
    await mongoose.connect(mongoUri!, { dbName: 'wardpilot_patient_flow_test', serverSelectionTimeoutMS: 10_000 });
    await Promise.all([Organization, User, Membership, RefreshSession, Facility, Building, Ward, Bed, Patient, Admission, PatientFlowEvent].map((model) => model.init()));
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    organizationId = new Types.ObjectId();
    otherOrganizationId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const otherSessionId = new Types.ObjectId();

    await Organization.create([
      { _id: organizationId, name: 'North Hospital Group', slug: 'north-hospital-group' },
      { _id: otherOrganizationId, name: 'South Hospital Group', slug: 'south-hospital-group' },
    ]);
    await User.create([
      { _id: userId, email: 'integration@wardpilot.test', passwordHash: 'not-used', firstName: 'Test', lastName: 'Operator' },
      { _id: otherUserId, email: 'other@wardpilot.test', passwordHash: 'not-used', firstName: 'Other', lastName: 'Operator' },
    ]);
    await Membership.create([
      { userId, organizationId, role: 'owner', status: 'active' },
      { userId: otherUserId, organizationId: otherOrganizationId, role: 'owner', status: 'active' },
    ]);
    await RefreshSession.create([
      { _id: sessionId, userId, organizationId, tokenHash: 'integration-session-hash', expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null },
      { _id: otherSessionId, userId: otherUserId, organizationId: otherOrganizationId, tokenHash: 'other-integration-session-hash', expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null },
    ]);
    accessToken = signAccessToken({ userId: String(userId), organizationId: String(organizationId), sessionId: String(sessionId) });
    otherAccessToken = signAccessToken({ userId: String(otherUserId), organizationId: String(otherOrganizationId), sessionId: String(otherSessionId) });

    facilityId = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const wardId = new Types.ObjectId();
    firstBedId = new Types.ObjectId();
    secondBedId = new Types.ObjectId();
    await Facility.create({ _id: facilityId, organizationId, name: 'Central Hospital', code: 'CENTRAL', address: { line1: '1 Main Road', city: 'Kolkata', country: 'India' } });
    await Building.create({ _id: buildingId, organizationId, facilityId, name: 'Main Block', code: 'MAIN', floors: 5 });
    await Ward.create({ _id: wardId, organizationId, facilityId, buildingId, name: 'General Ward', code: 'GEN', floor: 1 });
    await Bed.create([
      { _id: firstBedId, organizationId, facilityId, wardId, label: 'G-01', status: 'available' },
      { _id: secondBedId, organizationId, facilityId, wardId, label: 'G-02', status: 'available' },
    ]);
  });

  afterAll(async () => { await mongoose.disconnect(); });

  const auth = (token = accessToken) => ({ Authorization: `Bearer ${token}` });
  const payload = (bedId: Types.ObjectId, mrn: string) => ({
    facilityId: String(facilityId), bedId: String(bedId), medicalRecordNumber: mrn,
    firstName: 'Asha', lastName: 'Sen', admissionReason: 'Observation and inpatient care',
  });

  it('admits, transfers, discharges, records events, and isolates tenant data', async () => {
    const admitted = await request(app).post('/api/v1/patient-flow/admissions').set(auth()).send(payload(firstBedId, 'MRN-1001'));
    expect(admitted.status).toBe(201);
    const admissionId = admitted.body.data._id as string;
    expect((await Bed.findById(firstBedId))?.status).toBe('occupied');

    const transferred = await request(app).post(`/api/v1/patient-flow/admissions/${admissionId}/transfer`).set(auth()).send({ bedId: String(secondBedId), note: 'Move closer to nursing station' });
    expect(transferred.status).toBe(200);
    expect(String(transferred.body.data.bedId._id)).toBe(String(secondBedId));
    expect((await Bed.findById(firstBedId))?.status).toBe('cleaning');
    expect((await Bed.findById(secondBedId))?.status).toBe('occupied');

    const history = await request(app).get(`/api/v1/patient-flow/admissions/${admissionId}/events`).set(auth());
    expect(history.status).toBe(200);
    expect(history.body.data.map((event: { type: string }) => event.type)).toEqual(['admitted', 'transferred']);
    expect((await request(app).get(`/api/v1/patient-flow/admissions/${admissionId}/events`).set(auth(otherAccessToken))).status).toBe(404);
    const otherAdmissions = await request(app).get('/api/v1/patient-flow/admissions').set(auth(otherAccessToken));
    expect(otherAdmissions.status).toBe(200);
    expect(otherAdmissions.body.data).toHaveLength(0);

    const discharged = await request(app).post(`/api/v1/patient-flow/admissions/${admissionId}/discharge`).set(auth()).send({ note: 'Discharged after review' });
    expect(discharged.status).toBe(200);
    expect(discharged.body.data.status).toBe('discharged');
    expect((await Bed.findById(secondBedId))?.status).toBe('cleaning');
    expect(await PatientFlowEvent.countDocuments({ admissionId: new Types.ObjectId(admissionId), organizationId })).toBe(3);
  });

  it('rejects duplicate active admissions for a patient and rolls back bed allocation', async () => {
    expect((await request(app).post('/api/v1/patient-flow/admissions').set(auth()).send(payload(firstBedId, 'MRN-2002'))).status).toBe(201);
    const duplicate = await request(app).post('/api/v1/patient-flow/admissions').set(auth()).send(payload(secondBedId, 'MRN-2002'));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('RESOURCE_CONFLICT');
    expect((await Bed.findById(secondBedId))?.status).toBe('available');
    expect(await Admission.countDocuments({ organizationId, status: 'admitted' })).toBe(1);
  });

  it('allows only one concurrent admission to claim a bed', async () => {
    const [left, right] = await Promise.all([
      request(app).post('/api/v1/patient-flow/admissions').set(auth()).send(payload(firstBedId, 'MRN-3003')),
      request(app).post('/api/v1/patient-flow/admissions').set(auth()).send(payload(firstBedId, 'MRN-3004')),
    ]);
    expect([left.status, right.status].filter((status) => status === 201)).toHaveLength(1);
    expect([left.status, right.status].filter((status) => status === 409)).toHaveLength(1);
    expect(await Admission.countDocuments({ organizationId, status: 'admitted' })).toBe(1);
    expect((await Bed.findById(firstBedId))?.status).toBe('occupied');
  });

  it('rejects resources belonging to another tenant', async () => {
    const foreignFacilityId = new Types.ObjectId();
    const foreignBuildingId = new Types.ObjectId();
    const foreignWardId = new Types.ObjectId();
    const foreignBedId = new Types.ObjectId();
    await Facility.create({ _id: foreignFacilityId, organizationId: otherOrganizationId, name: 'Foreign Hospital', code: 'FOREIGN', address: { line1: '2 Main Road', city: 'Kolkata', country: 'India' } });
    await Building.create({ _id: foreignBuildingId, organizationId: otherOrganizationId, facilityId: foreignFacilityId, name: 'Foreign Block', code: 'FBLK', floors: 2 });
    await Ward.create({ _id: foreignWardId, organizationId: otherOrganizationId, facilityId: foreignFacilityId, buildingId: foreignBuildingId, name: 'Foreign Ward', code: 'FW', floor: 1 });
    await Bed.create({ _id: foreignBedId, organizationId: otherOrganizationId, facilityId: foreignFacilityId, wardId: foreignWardId, label: 'F-01' });
    const response = await request(app).post('/api/v1/patient-flow/admissions').set(auth()).send({ ...payload(foreignBedId, 'MRN-4004'), facilityId: String(foreignFacilityId) });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('FACILITY_NOT_FOUND');
    expect(await Admission.countDocuments({ organizationId })).toBe(0);
    expect((await Bed.findById(foreignBedId))?.status).toBe('available');
  });
});
