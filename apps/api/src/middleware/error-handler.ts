import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error.status === 'number' ? error.status : 500;
  const message = status >= 500 && env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : error.message || 'An unexpected server error occurred.';
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, error: { code: status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR', message } });
};
