import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./config/database', () => ({ isDatabaseReady: vi.fn(() => false) }));
import { app } from './app';
import { isDatabaseReady } from './config/database';

describe('health endpoints', () => {
  afterEach(() => vi.clearAllMocks());
  it('returns liveness without depending on MongoDB', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('alive');
  });
  it('reports degraded dependency state when MongoDB is unavailable', async () => {
    vi.mocked(isDatabaseReady).mockReturnValue(false);
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(response.body.data.database).toBe('disconnected');
  });
  it('returns a consistent not-found response', async () => {
    const response = await request(app).get('/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
