import { Schema, model, type InferSchemaType } from 'mongoose';
import { REQUEST_TYPES } from '../types/constants';

const customerRequestSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    tableSessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', required: true },
    type: { type: String, enum: REQUEST_TYPES, required: true },
    note: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED', 'DONE'], default: 'OPEN' },
    handledByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

customerRequestSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });

export type CustomerRequest = InferSchemaType<typeof customerRequestSchema>;
export const CustomerRequestModel = model('CustomerRequest', customerRequestSchema);
