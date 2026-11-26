import type { RequestHandler } from 'express';
import { env } from '../config/env';

export const requireTrustedOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== env.CLIENT_ORIGIN) {
    res.status(403).json({ success: false, error: { code: 'UNTRUSTED_ORIGIN', message: 'This request origin is not allowed.' } });
    return;
  }
  next();
};
