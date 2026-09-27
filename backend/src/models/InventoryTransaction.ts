import { Schema, model, type InferSchemaType } from 'mongoose';
import { INVENTORY_TX_TYPES } from '../types/constants';

const inventoryTransactionSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    type: { type: String, enum: INVENTORY_TX_TYPES, required: true },
    qty: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    refOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    note: { type: String, trim: true, default: '' },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

inventoryTransactionSchema.index({ restaurantId: 1, itemId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ restaurantId: 1, createdAt: -1 });

export type InventoryTransaction = InferSchemaType<typeof inventoryTransactionSchema>;
export const InventoryTransactionModel = model('InventoryTransaction', inventoryTransactionSchema);
