import { Schema, model, type InferSchemaType } from 'mongoose';

const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 },
});

export type Counter = InferSchemaType<typeof counterSchema>;
export const CounterModel = model('Counter', counterSchema);

/** Atomically increments a named counter (daily order/bill numbering). */
export async function nextSeq(key: string): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean();
  return doc!.seq;
}
