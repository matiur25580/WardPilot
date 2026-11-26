import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  void next;
  if (error instanceof ZodError) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The request contains invalid fields.', details: error.flatten().fieldErrors } });
    return;
  }
  if (error?.code === 11000) {
    res.status(409).json({ success: false, error: { code: 'RESOURCE_CONFLICT', message: 'A record with one of these unique values already exists.' } });
    return;
  }
  const status = typeof error.status === 'number' ? error.status : 500;
  const message = status >= 500 && env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : error.message || 'An unexpected server error occurred.';
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, error: { code: error.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'), message } });
};
