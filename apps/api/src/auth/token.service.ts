import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';

export interface TokenIdentity {
  userId: string;
  organizationId: string;
}
export interface AccessClaims extends JwtPayload, TokenIdentity {
  type: 'access';
  sessionId: string;
}
export interface RefreshClaims extends JwtPayload, TokenIdentity {
  type: 'refresh';
  secret: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function createRefreshSecret(): string {
  return randomBytes(48).toString('base64url');
}
export function signAccessToken(identity: TokenIdentity & { sessionId: string }): string {
  return jwt.sign({ ...identity, type: 'access' }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'], issuer: 'wardpilot-api', audience: 'wardpilot-web' });
}
export function signRefreshToken(identity: TokenIdentity, secret: string): string {
  return jwt.sign({ ...identity, type: 'refresh', secret }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'], issuer: 'wardpilot-api', audience: 'wardpilot-refresh' });
}
export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'wardpilot-api', audience: 'wardpilot-web' });
  if (typeof payload === 'string' || payload.type !== 'access' || typeof payload.userId !== 'string' || typeof payload.organizationId !== 'string' || typeof payload.sessionId !== 'string') throw new Error('Invalid access token');
  return payload as AccessClaims;
}
export function verifyRefreshToken(token: string): RefreshClaims {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'wardpilot-api', audience: 'wardpilot-refresh' });
  if (typeof payload === 'string' || payload.type !== 'refresh' || typeof payload.userId !== 'string' || typeof payload.organizationId !== 'string' || typeof payload.secret !== 'string') throw new Error('Invalid refresh token');
  return payload as RefreshClaims;
}
