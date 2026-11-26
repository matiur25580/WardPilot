import type { RequestHandler } from 'express';
import { Membership } from '../models/membership.model';
import { User } from '../models/user.model';
import { verifyAccessToken } from './token.service';

export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to continue.' } });
      return;
    }
    const claims = verifyAccessToken(header.slice(7));
    const [user, membership] = await Promise.all([
      User.findById(claims.userId).select('email status').lean(),
      Membership.findOne({ userId: claims.userId, organizationId: claims.organizationId, status: 'active' }).lean(),
    ]);
    if (!user || user.status !== 'active' || !membership) {
      res.status(401).json({ success: false, error: { code: 'SESSION_INVALID', message: 'Your session is no longer valid.' } });
      return;
    }
    req.auth = { userId: String(user._id), organizationId: String(claims.organizationId), tenantId: String(claims.organizationId), role: membership.role, email: user.email };
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'INVALID_ACCESS_TOKEN', message: 'Your session is invalid or expired.' } });
  }
};

export function requireRoles(...roles: Array<'owner' | 'admin' | 'manager' | 'staff' | 'viewer'>): RequestHandler {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'You do not have permission to perform this action.' } });
      return;
    }
    next();
  };
}
