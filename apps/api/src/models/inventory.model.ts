import { Schema, model } from 'mongoose';

const inventoryItemSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
  itemCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, enum: ['medical_supply', 'ppe', 'consumable', 'equipment', 'pharmacy_stock', 'other'], required: true },
  unit: { type: String, required: true, trim: true, maxlength: 24 },
  onHand: { type: Number, required: true, min: 0, default: 0 },
  reorderPoint: { type: Number, required: true, min: 0, default: 0 },
  parLevel: { type: Number, required: true, min: 0, default: 0 },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastCountedAt: { type: Date, default: null }
}, { timestamps: true });
inventoryItemSchema.index({ organizationId: 1, facilityId: 1, itemCode: 1 }, { unique: true });
inventoryItemSchema.index({ organizationId: 1, facilityId: 1, status: 1, onHand: 1, reorderPoint: 1 });

const inventoryMovementSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
  itemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  type: { type: String, enum: ['receive', 'consume', 'adjust'], required: true },
  quantityChange: { type: Number, required: true },
  balanceAfter: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  reference: { type: String, trim: true, maxlength: 120, default: '' },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 120 },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
inventoryMovementSchema.index({ organizationId: 1, itemId: 1, createdAt: -1 });
inventoryMovementSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });

export const InventoryItem = model('InventoryItem', inventoryItemSchema);
export const InventoryMovement = model('InventoryMovement', inventoryMovementSchema);
