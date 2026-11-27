import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { app } from '../app';
import { signAccessToken } from '../auth/token.service';
import { Membership, type MembershipRole } from '../models/membership.model';
import { Organization } from '../models/organization.model';
import { RefreshSession } from '../models/refresh-session.model';
import { User } from '../models/user.model';
import { Bed, Building, Department, Facility, Ward } from '../models/resource.model';

const mongoUri = process.env.MONGODB_URI;
const integrationDescribe = mongoUri && process.env.WARDPILOT_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
type Actor = { token: string; userId: Types.ObjectId; sessionId: Types.ObjectId };

integrationDescribe('resource registry HTTP integration (replica-set MongoDB)', () => {
  let organizationId: Types.ObjectId;
  let otherOrganizationId: Types.ObjectId;
  let facilityId: Types.ObjectId;
  let buildingId: Types.ObjectId;
  let departmentId: Types.ObjectId;
  let wardId: Types.ObjectId;
  let bedId: Types.ObjectId;
  let owner: Actor;
  let viewer: Actor;
  let manager: Actor;
  let staff: Actor;
  let otherTenant: Actor;

  async function createActor(orgId: Types.ObjectId, role: MembershipRole, email: string): Promise<Actor> {
    const userId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();
    await User.create({ _id: userId, email, passwordHash: 'integration-only-hash', firstName: 'Registry', lastName: 'Tester' });
    await Membership.create({ userId, organizationId: orgId, role, status: 'active' });
    await RefreshSession.create({
      _id: sessionId, userId, organizationId: orgId, tokenHash: `integration-${sessionId}`,
      expiresAt: new Date(Date.now() + 60 * 60_000), revokedAt: null,
    });
    return { userId, sessionId, token: signAccessToken({ userId: String(userId), organizationId: String(orgId), sessionId: String(sessionId) }) };
  }

  const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });
  const facilityPayload = (code = 'NEW-FAC') => ({
    name: 'New Clinical Centre', code,
    address: { line1: '10 Registry Road', city: 'Kolkata', country: 'India' },
    timezone: 'Asia/Kolkata',
  });

  beforeAll(async () => {
    await mongoose.connect(mongoUri!, { serverSelectionTimeoutMS: 10_000 });
    await Promise.all([Organization, User, Membership, RefreshSession, Facility, Department, Building, Ward, Bed].map((model) => model.init()));
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
    organizationId = new Types.ObjectId();
    otherOrganizationId = new Types.ObjectId();
    await Organization.create([
      { _id: organizationId, name: 'North Hospital Group', slug: 'north-hospital-group' },
      { _id: otherOrganizationId, name: 'South Hospital Group', slug: 'south-hospital-group' },
    ]);
    [owner, viewer, manager, staff, otherTenant] = await Promise.all([
      createActor(organizationId, 'owner', 'owner@registry.test'),
      createActor(organizationId, 'viewer', 'viewer@registry.test'),
      createActor(organizationId, 'manager', 'manager@registry.test'),
      createActor(organizationId, 'staff', 'staff@registry.test'),
      createActor(otherOrganizationId, 'owner', 'foreign-owner@registry.test'),
    ]);

    facilityId = new Types.ObjectId();
    buildingId = new Types.ObjectId();
    departmentId = new Types.ObjectId();
    wardId = new Types.ObjectId();
    bedId = new Types.ObjectId();
    await Facility.create({ _id: facilityId, organizationId, name: 'Central Hospital', code: 'CENTRAL', address: { line1: '1 Main Road', city: 'Kolkata', country: 'India' } });
    await Building.create({ _id: buildingId, organizationId, facilityId, name: 'Main Block', code: 'MAIN', floors: 5 });
    await Department.create({ _id: departmentId, organizationId, facilityId, name: 'Cardiology', code: 'CARD' });
    await Ward.create({ _id: wardId, organizationId, facilityId, buildingId, departmentId, name: 'General Ward', code: 'GEN', floor: 1 });
    await Bed.create({ _id: bedId, organizationId, facilityId, wardId, label: 'G-01', status: 'available' });

    const foreignFacilityId = new Types.ObjectId();
    const foreignBuildingId = new Types.ObjectId();
    const foreignWardId = new Types.ObjectId();
    await Facility.create({ _id: foreignFacilityId, organizationId: otherOrganizationId, name: 'Foreign Hospital', code: 'FOREIGN', address: { line1: '2 Main Road', city: 'Kolkata', country: 'India' } });
    await Building.create({ _id: foreignBuildingId, organizationId: otherOrganizationId, facilityId: foreignFacilityId, name: 'Foreign Block', code: 'FBLK', floors: 3 });
    await Ward.create({ _id: foreignWardId, organizationId: otherOrganizationId, facilityId: foreignFacilityId, buildingId: foreignBuildingId, name: 'Foreign Ward', code: 'FW', floor: 1 });
  });

  afterAll(async () => { await mongoose.disconnect(); });

  it('requires an authenticated, active organization membership for every registry endpoint', async () => {
    const response = await request(app).get('/api/v1/resources/facilities');
    expect(response.status).toBe(401);
    const create = await request(app).post('/api/v1/resources/facilities').send(facilityPayload());
    expect(create.status).toBe(401);
  });

  it('enforces the registry role matrix: viewers are read-only and staff may update bed status only', async () => {
    const read = await request(app).get('/api/v1/resources/facilities').set(auth(viewer));
    expect(read.status).toBe(200);
    expect(read.body.data).toHaveLength(1);

    const viewerCreate = await request(app).post('/api/v1/resources/facilities').set(auth(viewer)).send(facilityPayload());
    expect(viewerCreate.status).toBe(403);
    expect(viewerCreate.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    const staffCreate = await request(app).post('/api/v1/resources/buildings').set(auth(staff)).send({ facilityId: String(facilityId), name: 'Annex', code: 'ANNEX', floors: 2 });
    expect(staffCreate.status).toBe(403);

    const staffUpdate = await request(app).patch(`/api/v1/resources/beds/${bedId}/status`).set(auth(staff)).send({ status: 'occupied' });
    expect(staffUpdate.status).toBe(200);
    expect(staffUpdate.body.data.status).toBe('occupied');
  });

  it('lists only the caller tenant resources and preserves bed facility linkage for the UI', async () => {
    for (const resource of ['facilities', 'departments', 'buildings', 'wards', 'beds']) {
      const response = await request(app).get(`/api/v1/resources/${resource}`).set(auth(owner));
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(String(response.body.data[0].organizationId)).toBe(String(organizationId));
    }

    const beds = await request(app).get('/api/v1/resources/beds').set(auth(owner)).query({ facilityId: String(facilityId), status: 'available' });
    expect(beds.status).toBe(200);
    expect(String(beds.body.data[0].facilityId)).toBe(String(facilityId));
    expect(beds.body.data[0].wardId.name).toBe('General Ward');

    const foreignFacilities = await request(app).get('/api/v1/resources/facilities').set(auth(otherTenant));
    expect(foreignFacilities.status).toBe(200);
    expect(foreignFacilities.body.data).toHaveLength(1);
    expect(String(foreignFacilities.body.data[0]._id)).not.toBe(String(facilityId));

    const foreignFilter = await request(app).get('/api/v1/resources/beds').set(auth(owner)).query({ facilityId: String(new Types.ObjectId()) });
    expect(foreignFilter.status).toBe(200);
    expect(foreignFilter.body.data).toHaveLength(0);
  });

  it('allows managers to create valid resources but rejects cross-tenant parent references', async () => {
    const createdFacility = await request(app).post('/api/v1/resources/facilities').set(auth(manager)).send(facilityPayload('MANAGER-FAC'));
    expect(createdFacility.status).toBe(201);
    const newFacilityId = createdFacility.body.data._id as string;

    const department = await request(app).post('/api/v1/resources/departments').set(auth(manager)).send({ facilityId: newFacilityId, name: 'Neurology', code: 'NEURO' });
    expect(department.status).toBe(201);

    const building = await request(app).post('/api/v1/resources/buildings').set(auth(manager)).send({ facilityId: newFacilityId, name: 'West Wing', code: 'WEST', floors: 4 });
    expect(building.status).toBe(201);

    const ward = await request(app).post('/api/v1/resources/wards').set(auth(manager)).send({
      facilityId: newFacilityId, buildingId: building.body.data._id, departmentId: department.body.data._id,
      name: 'Neuro Ward', code: 'NW', floor: 2, careType: 'general',
    });
    expect(ward.status).toBe(201);

    const bed = await request(app).post('/api/v1/resources/beds').set(auth(manager)).send({ facilityId: newFacilityId, wardId: ward.body.data._id, label: 'NW-01' });
    expect(bed.status).toBe(201);
    expect(bed.body.data.status).toBe('available');

    const foreignFacility = await Facility.findOne({ organizationId: otherOrganizationId });
    const foreignBuilding = await Building.findOne({ organizationId: otherOrganizationId });
    const crossTenantDepartment = await request(app).post('/api/v1/resources/departments').set(auth(manager)).send({
      facilityId: String(foreignFacility!._id), name: 'Unauthorized Department', code: 'UNAUTH',
    });
    expect(crossTenantDepartment.status).toBe(404);
    expect(crossTenantDepartment.body.error.code).toBe('FACILITY_NOT_FOUND');

    const crossFacilityBuilding = await request(app).post('/api/v1/resources/wards').set(auth(manager)).send({
      facilityId: newFacilityId, buildingId: String(foreignBuilding!._id), name: 'Invalid Ward', code: 'BAD-WARD', floor: 1,
    });
    expect(crossFacilityBuilding.status).toBe(404);
    expect(crossFacilityBuilding.body.error.code).toBe('BUILDING_NOT_FOUND');
  });

  it('validates malformed filters, invalid floor bounds, and illegal bed status transitions', async () => {
    const malformed = await request(app).get('/api/v1/resources/beds').set(auth(owner)).query({ facilityId: 'not-an-object-id' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

    const invalidFloor = await request(app).post('/api/v1/resources/wards').set(auth(owner)).send({
      facilityId: String(facilityId), buildingId: String(buildingId), name: 'Top Floor Ward', code: 'TOP',
      floor: 5,
    });
    expect(invalidFloor.status).toBe(400);
    expect(invalidFloor.body.error.code).toBe('INVALID_FLOOR');

    const illegalTransition = await request(app).patch(`/api/v1/resources/beds/${bedId}/status`).set(auth(owner)).send({ status: 'occupied' });
    expect(illegalTransition.status).toBe(200);
    const directRelease = await request(app).patch(`/api/v1/resources/beds/${bedId}/status`).set(auth(owner)).send({ status: 'available' });
    expect(directRelease.status).toBe(400);
  });
});
