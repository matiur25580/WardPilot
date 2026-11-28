import { Schema, model } from 'mongoose';
const auditEventSchema = new Schema({
 organizationId:{type:Schema.Types.ObjectId,ref:'Organization',required:true},
 actorId:{type:Schema.Types.ObjectId,ref:'User',required:true},
 action:{type:String,required:true,enum:['facility.created','department.created','building.created','ward.created','bed.created','bed.status_changed','admission.created','admission.transferred','admission.discharged','staff_shift.created','staff_shift.status_changed','inventory_item.created','inventory.movement_recorded']},
 entityType:{type:String,required:true,enum:['facility','department','building','ward','bed','admission','staff_shift','inventory_item','inventory_movement']},
 entityId:{type:Schema.Types.ObjectId,required:true},facilityId:{type:Schema.Types.ObjectId,ref:'Facility',default:null},
 summary:{type:String,required:true,maxlength:240},
 details:{type:Schema.Types.Mixed,default:{}},occurredAt:{type:Date,required:true,default:Date.now}
},{timestamps:false,strict:true});
auditEventSchema.index({organizationId:1,occurredAt:-1,_id:-1});
auditEventSchema.index({organizationId:1,entityType:1,entityId:1,occurredAt:-1});
auditEventSchema.pre('save',function(){if(!this.isNew)throw new Error('Audit events are append-only.');});
for(const operation of ['updateOne','updateMany','findOneAndUpdate','deleteOne','deleteMany','findOneAndDelete','replaceOne'] as const){
 auditEventSchema.pre(operation,function(){throw new Error('Audit events are append-only.');});
}
export const AuditEvent=model('AuditEvent',auditEventSchema);
