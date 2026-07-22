import { Schema, model } from 'mongoose';

export interface IUser {
  email: string;
  name: string;
  role: 'admin' | 'member';
  telegramId?: string;
  addedAt: number;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'member'], required: true },
  telegramId: { type: String, unique: true, sparse: true },
  addedAt: { type: Number, required: true },
});

export const User = model<IUser>('User', userSchema);
