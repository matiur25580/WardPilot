import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { getOperationalOverview } from '../services/intelligence';

export const intelligenceRouter = Router();
intelligenceRouter.use(authenticate);

const querySchema = z.object({
  facilityId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to && Date.parse(value.from) >= Date.parse(value.to)) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'End of reporting window must be after its start.' });
  }
  if (value.from && value.to && Date.parse(value.to) - Date.parse(value.from) > 90 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'Reporting windows cannot exceed 90 days.' });
  }
});

intelligenceRouter.get('/overview', async (req, res, next) => {
  try {
    const filters = querySchema.parse(req.query);
    const overview = await getOperationalOverview(req.auth!.organizationId, filters);
    res.json({ success: true, data: overview });
  } catch (error) { next(error); }
});
