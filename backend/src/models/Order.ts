import { Schema, model, type InferSchemaType } from 'mongoose';
import { ORDER_SOURCES, ORDER_STATUSES, STATIONS } from '../types/constants';

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    taxPercent: { type: Number, default: 0 },
    station: { type: String, enum: STATIONS, default: 'MAIN' },
    addons: [
      {
        _id: false,
        addonId: { type: Schema.Types.ObjectId, ref: 'Addon' },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    notes: { type: String, trim: true, default: '' },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    orderNumber: { type: String, required: true },
    source: { type: String, enum: ORDER_SOURCES, required: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', default: null },
    tableSessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', default: null },
    waiterId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    customerName: { type: String, trim: true, default: '' },
    customerPhone: { type: String, trim: true, default: '' },
    customerAddress: { type: String, trim: true, default: '' },
    customerCity: { type: String, trim: true, default: '' },
    externalOrderId: { type: String, trim: true, default: null },
    integrationMeta: { type: Schema.Types.Mixed, default: null },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, required: true, default: 0 },
    taxTotal: { type: Number, required: true, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    discountNote: { type: String, trim: true, default: '' },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'PLACED' },
    cancelReason: { type: String, trim: true, default: '' },
    paymentStatus: { type: String, enum: ['UNPAID', 'PAID', 'REFUNDED'], default: 'UNPAID' },
    billId: { type: Schema.Types.ObjectId, ref: 'Bill', default: null },
    notes: { type: String, trim: true, default: '' },
    placedAt: { type: Date, default: () => new Date() },
    acceptedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
    servedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: ORDER_STATUSES },
        at: { type: Date, default: () => new Date() },
        byUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],
  },
  { timestamps: true },
);

orderSchema.index({ restaurantId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, tableSessionId: 1 });
orderSchema.index(
  { restaurantId: 1, source: 1, externalOrderId: 1 },
  { unique: true, partialFilterExpression: { externalOrderId: { $type: 'string' } } },
);

export type Order = InferSchemaType<typeof orderSchema>;
export const OrderModel = model('Order', orderSchema);
