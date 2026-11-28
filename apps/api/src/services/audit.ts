import type {ClientSession,Types} from 'mongoose';
import {AuditEvent} from '../models/audit-event.model';
const allowed=new Set(['fromStatus','toStatus','facilityCode','bedLabel','sourceBedId','destinationBedId','shiftType','startAt','endAt','itemCode','quantityChange','balanceAfter']);
export function sanitizeAuditDetails(details:Record<string,unknown>={}) {
 const safe:Record<string,string|number>={};
 for(const [key,value] of Object.entries(details)){
  if(!allowed.has(key))continue;
  if(typeof value==='string')safe[key]=value.slice(0,120);
  else if(typeof value==='number'&&Number.isFinite(value))safe[key]=value;
 }
 return safe;
}
export async function recordAuditEvent(input:{organizationId:string|Types.ObjectId;actorId:string|Types.ObjectId;action:string;entityType:string;entityId:string|Types.ObjectId;facilityId?:string|Types.ObjectId|null;summary:string;details?:Record<string,unknown>},session?:ClientSession){
 const [event]=await AuditEvent.create([{...input,details:sanitizeAuditDetails(input.details)}],session?{session}:{});
 if(!event)throw new Error('Audit event could not be recorded.');
 return event;
}
