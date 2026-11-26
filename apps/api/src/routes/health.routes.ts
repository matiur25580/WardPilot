import { Router } from 'express';
import { isDatabaseReady } from '../config/database';
export const healthRouter = Router();
healthRouter.get('/', (_req, res) => {
  const database = isDatabaseReady() ? 'connected' : 'disconnected';
  const healthy = database === 'connected';
  res.status(healthy ? 200 : 503).json({ success: healthy, data: { service: 'wardpilot-api', status: healthy ? 'ok' : 'degraded', database, timestamp: new Date().toISOString() } });
});
