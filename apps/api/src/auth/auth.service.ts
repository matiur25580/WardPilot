import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { Membership } from '../models/membership.model';
import { Organization } from '../models/organization.model';
import { RefreshSession } from '../models/refresh-session.model';
import { User } from '../models/user.model';
import type { LoginInput, RegisterInput } from './auth.schemas';
import { createRefreshSecret, hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from './token.service';

const refreshCookieName = 'wardpilot_refresh';
function ttlMilliseconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error('Unsupported token lifetime.');
  const units = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * units[match[2] as keyof typeof units];
}
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: `${env.API_BASE_PATH}/auth`,
};
function createSlug(name: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'hospital';
  return `${base}-${randomBytes(3).toString('hex')}`;
}
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(refreshCookieName, token, { ...refreshCookieOptions, maxAge: ttlMilliseconds(env.JWT_REFRESH_TTL) });
}
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshCookieName, refreshCookieOptions);
}
async function issueSession(userId: string, organizationId: string, req: Request, res: Response) {
  const identity = { userId, organizationId };
  const secret = createRefreshSecret();
  const refreshToken = signRefreshToken(identity, secret);
  const tokenHash = hashToken(refreshToken);
  await RefreshSession.create({
    ...identity,
    tokenHash,
    expiresAt: new Date(Date.now() + ttlMilliseconds(env.JWT_REFRESH_TTL)),
    userAgent: req.get('user-agent')?.slice(0, 500),
    ipAddress: req.ip?.slice(0, 64),
  });
  setRefreshCookie(res, refreshToken);
  return {
    tokenHash,
    tokens: { accessToken: signAccessToken(identity), tokenType: 'Bearer', expiresIn: env.JWT_ACCESS_TTL },
  };
}

export async function register(input: RegisterInput, req: Request, res: Response) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const organization = await Organization.create({ name: input.organizationName, slug: createSlug(input.organizationName) });
  try {
    const user = await User.create({ email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName });
    try {
      await Membership.create({ userId: user._id, organizationId: organization._id, role: 'owner' });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
    const session = await issueSession(String(user._id), String(organization._id), req, res);
    return { user: { id: String(user._id), email: user.email, firstName: user.firstName, lastName: user.lastName }, organization: { id: String(organization._id), name: organization.name, slug: organization.slug, role: 'owner' }, ...session.tokens };
  } catch (error) {
    await Organization.deleteOne({ _id: organization._id });
    throw error;
  }
}

export async function login(input: LoginInput, req: Request, res: Response) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user || user.status !== 'active' || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw Object.assign(new Error('Email or password is incorrect.'), { status: 401, code: 'INVALID_CREDENTIALS' });
  }
  const membership = await Membership.findOne({ userId: user._id, status: 'active' }).populate('organizationId', 'name slug status').sort({ createdAt: 1 });
  if (!membership || !membership.organizationId || typeof membership.organizationId !== 'object' || !('status' in membership.organizationId) || membership.organizationId.status !== 'active') {
    throw Object.assign(new Error('No active organization membership is available.'), { status: 403, code: 'NO_ACTIVE_ORGANIZATION' });
  }
  const organization = membership.organizationId as unknown as { _id: { toString(): string }; name: string; slug: string };
  const session = await issueSession(String(user._id), String(organization._id), req, res);
  return { user: { id: String(user._id), email: user.email, firstName: user.firstName, lastName: user.lastName }, organization: { id: String(organization._id), name: organization.name, slug: organization.slug, role: membership.role }, ...session.tokens };
}

export async function refreshSession(token: string | undefined, req: Request, res: Response) {
  if (!token) throw Object.assign(new Error('Refresh session is required.'), { status: 401, code: 'REFRESH_REQUIRED' });
  let claims;
  try { claims = verifyRefreshToken(token); } catch {
    clearRefreshCookie(res);
    throw Object.assign(new Error('Refresh session is invalid or expired.'), { status: 401, code: 'REFRESH_INVALID' });
  }
  const tokenHash = hashToken(token);
  const current = await RefreshSession.findOneAndUpdate(
    { tokenHash, userId: claims.userId, organizationId: claims.organizationId, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: false },
  );
  if (!current) {
    await RefreshSession.updateMany({ userId: claims.userId, organizationId: claims.organizationId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    throw Object.assign(new Error('Refresh token reuse detected. Please sign in again.'), { status: 401, code: 'REFRESH_REUSE_DETECTED' });
  }
  const nextSession = await issueSession(claims.userId, claims.organizationId, req, res);
  await RefreshSession.updateOne({ _id: current._id }, { $set: { replacedByTokenHash: nextSession.tokenHash } });
  return nextSession.tokens;
}

export async function logout(token: string | undefined, res: Response): Promise<void> {
  if (token) {
    try {
      const claims = verifyRefreshToken(token);
      await RefreshSession.updateOne({ tokenHash: hashToken(token), userId: claims.userId, organizationId: claims.organizationId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    } catch { /* Invalid or expired cookies are simply cleared. */ }
  }
  clearRefreshCookie(res);
}

export async function getCurrentUser(userId: string, organizationId: string) {
  const [user, membership] = await Promise.all([
    User.findById(userId).select('email firstName lastName status').lean(),
    Membership.findOne({ userId, organizationId, status: 'active' }).populate('organizationId', 'name slug').lean(),
  ]);
  if (!user || user.status !== 'active' || !membership || !membership.organizationId) return null;
  const org = membership.organizationId as unknown as { _id: { toString(): string }; name: string; slug: string };
  return { user: { id: String(user._id), email: user.email, firstName: user.firstName, lastName: user.lastName }, organization: { id: String(org._id), name: org.name, slug: org.slug, role: membership.role } };
}

export const authCookieName = refreshCookieName;
