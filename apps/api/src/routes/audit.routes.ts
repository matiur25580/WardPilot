import {Router} from 'express';
import {z} from 'zod';
import {authenticate,requireRoles} from '../auth/auth.middleware';
import {AuditEvent} from '../models/audit-event.model';
export const auditRouter=Router();
auditRouter.use(authenticate,requireRoles('owner','admin','manager'));
const querySchema=z.object({
 page:z.coerce.number().int().min(1).max(10000).default(1),
 limit:z.coerce.number().int().min(1).max(100).default(25),
 action:z.string().max(64).optional(),
 entityType:z.enum(['facility','department','building','ward','bed','admission','staff_shift','inventory_item','inventory_movement']).optional(),
 facilityId:z.string().regex(/^[a-f\\d]{24}$/i).optional(),
 from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional()
}).strict().superRefine((value,ctx)=>{if(value.from&&value.to&&Date.parse(value.from)>=Date.parse(value.to))ctx.addIssue({code:'custom',path:['to'],message:'End of range must be after its start.'});});
auditRouter.get('/events',async(req,res,next)=>{
 try{
  const filters=querySchema.parse(req.query);
  const query:Record<string,unknown>={organizationId:req.auth!.organizationId};
  if(filters.action)query.action=filters.action;
  if(filters.entityType)query.entityType=filters.entityType;
  if(filters.facilityId)query.facilityId=filters.facilityId;
  if(filters.from||filters.to)query.occurredAt={...(filters.from?{$gte:new Date(filters.from)}:{}),...(filters.to?{$lt:new Date(filters.to)}:{})};
  const [data,total]=await Promise.all([
   AuditEvent.find(query).populate('actorId','firstName lastName email').sort({occurredAt:-1,_id:-1}).skip((filters.page-1)*filters.limit).limit(filters.limit).lean(),
   AuditEvent.countDocuments(query)
  ]);
  res.json({success:true,data,pagination:{page:filters.page,limit:filters.limit,total,totalPages:Math.ceil(total/filters.limit)}});
 }catch(error){next(error);}
});
