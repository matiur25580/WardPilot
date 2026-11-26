import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.schemas';

describe('authentication request schemas', () => {
  it('normalizes registration email addresses', () => {
    const parsed = registerSchema.parse({
      email: '  ADMIN@EXAMPLE.COM ',
      password: 'SecurePassword123',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Northside Hospital',
    });
    expect(parsed.email).toBe('admin@example.com');
  });

  it('rejects weak registration passwords', () => {
    const parsed = registerSchema.safeParse({
      email: 'admin@example.com',
      password: 'password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Northside Hospital',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects malformed login email addresses', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'secret' }).success).toBe(false);
  });
});
