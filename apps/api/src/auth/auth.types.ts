import type { MembershipRole } from '../models/membership.model';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        tenantId: string;
        role: MembershipRole;
        email: string;
      };
    }
  }
}
export {};
