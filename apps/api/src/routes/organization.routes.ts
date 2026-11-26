import { Router } from 'express';
import { z } from 'zod';
import { Membership, membershipRoles } from '../models/membership.model';
import { Organization } from '../models/organization.model';
import { User } from '../models/user.model';
import { authenticate, requireRoles } from '../auth/auth.middleware';

export const organizationRouter = Router();
organizationRouter.use(authenticate);

organizationRouter.get('/current', async (req, res, next) => {
  try {
    const organization = await Organization.findOne({ _id: req.auth!.organizationId, status: 'active' }).select('name slug status createdAt').lean();
    if (!organization) { res.status(404).json({ success: false, error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' } }); return; }
    res.json({ success: true, data: { ...organization, id: String(organization._id), role: req.auth!.role } });
  } catch (error) { next(error); }
});

organizationRouter.get('/members', requireRoles('owner', 'admin', 'manager'), async (req, res, next) => {
  try {
    const members = await Membership.find({ organizationId: req.auth!.organizationId }).populate('userId', 'email firstName lastName status').select('userId role status createdAt').lean();
    res.json({ success: true, data: members.map((member) => {
      const user = member.userId as unknown as { _id: { toString(): string }; email: string; firstName: string; lastName: string; status: string };
      return { id: String(member._id), user: { id: String(user._id), email: user.email, firstName: user.firstName, lastName: user.lastName, status: user.status }, role: member.role, status: member.status, joinedAt: member.createdAt };
    }) });
  } catch (error) { next(error); }
});

const addMemberSchema = z.object({ email: z.string().trim().email().transform((value) => value.toLowerCase()), role: z.enum(membershipRoles).refine((role) => role !== 'owner', 'Use the ownership transfer workflow to assign an owner.') });
organizationRouter.post('/members', requireRoles('owner', 'admin'), async (req, res, next) => {
  try {
    const input = addMemberSchema.parse(req.body);
    const user = await User.findOne({ email: input.email, status: 'active' }).select('email firstName lastName');
    if (!user) { res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'No active WardPilot user exists with that email.' } }); return; }
    const existing = await Membership.findOne({ userId: user._id, organizationId: req.auth!.organizationId });
    if (existing) { res.status(409).json({ success: false, error: { code: 'MEMBERSHIP_EXISTS', message: 'This user already belongs to the organization.' } }); return; }
    const membership = await Membership.create({ userId: user._id, organizationId: req.auth!.organizationId, role: input.role });
    res.status(201).json({ success: true, data: { id: String(membership._id), user: { id: String(user._id), email: user.email, firstName: user.firstName, lastName: user.lastName }, role: membership.role, status: membership.status } });
  } catch (error) { next(error); }
});
