import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './token.service';

describe('access token service', () => {
  it('signs and verifies an identity scoped to one organization and session', () => {
    const identity = { userId: '507f1f77bcf86cd799439011', organizationId: '507f191e810c19729de860ea', sessionId: '507f1f77bcf86cd799439012' };
    const token = signAccessToken(identity);
    expect(verifyAccessToken(token)).toMatchObject({ ...identity, type: 'access' });
  });

  it('rejects invalid tokens', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });
});
