import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authCookieName, getCurrentUser, login, logout, refreshSession, register } from './auth.service';
import { authenticate } from './auth.middleware';
import { loginSchema, registerSchema } from './auth.schemas';
import { requireTrustedOrigin } from '../middleware/trusted-origin';

export const authRouter = Router();
authRouter.use(requireTrustedOrigin);
const signInLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.' } } });

authRouter.post('/register', async (req, res, next) => {
  try {
    const result = await register(registerSchema.parse(req.body), req, res);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
});
authRouter.post('/login', signInLimiter, async (req, res, next) => {
  try {
    const result = await login(loginSchema.parse(req.body), req, res);
    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
});
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const result = await refreshSession(req.cookies?.[authCookieName] as string | undefined, req, res);
    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
});
authRouter.post('/logout', async (req, res, next) => {
  try {
    await logout(req.cookies?.[authCookieName] as string | undefined, res);
    res.status(200).json({ success: true, data: { message: 'Signed out successfully.' } });
  } catch (error) { next(error); }
});
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await getCurrentUser(req.auth!.userId, req.auth!.organizationId);
    if (!result) { res.status(401).json({ success: false, error: { code: 'SESSION_INVALID', message: 'Your session is no longer valid.' } }); return; }
    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
});
