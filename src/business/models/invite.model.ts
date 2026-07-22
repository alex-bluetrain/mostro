import { Schema, model } from 'mongoose';

export interface IInvite {
  email: string;
  createdBy: string;
  createdAt: number;
  usedAt?: number;
  usedBy?: string;
}

const inviteSchema = new Schema<IInvite>({
  email: { type: String, required: true, unique: true, lowercase: true },
  createdBy: { type: String, required: true, lowercase: true },
  createdAt: { type: Number, required: true },
  usedAt: { type: Number },
  usedBy: { type: String, lowercase: true },
});

export const Invite = model<IInvite>('Invite', inviteSchema);
