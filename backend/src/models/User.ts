import { Schema, model, type InferSchemaType } from 'mongoose';
import { ROLES } from '../types/constants';
import { phoneDigits } from '../utils/phone';

const userSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    /** The same phone with everything but digits removed, so a code request can find an
     *  account however the number was typed when it was created. */
    phoneDigits: { type: String, index: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
    refreshTokenHash: { type: String, select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.pre('save', function stampPhoneDigits(next) {
  if (this.isModified('phone') || this.phoneDigits == null) {
    this.phoneDigits = phoneDigits(this.phone);
  }
  next();
});

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
