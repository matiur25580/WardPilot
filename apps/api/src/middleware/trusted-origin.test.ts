import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../app';

describe('trusted origin guard', () => {
  it('rejects cross-origin authentication mutations', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').set('Origin', 'https://attacker.example');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN');
  });

  it('allows same-origin requests to reach the route handler', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').set('Origin', 'http://localhost:5173');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('REFRESH_REQUIRED');
  });
});
