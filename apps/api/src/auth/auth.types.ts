import type { MembershipRole } from '../models/membership.model';

declare global {
  // Express augments Request through declaration merging.
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
