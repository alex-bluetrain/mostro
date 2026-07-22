import { Schema, model } from 'mongoose';

export interface IInvite {
  code: string;
  email: string;
  name?: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  usedBy?: string;
}

const inviteSchema = new Schema<IInvite>({
  code: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true },
  name: { type: String },
  createdBy: { type: String, required: true },
  createdAt: { type: Number, required: true },
  expiresAt: { type: Number, required: true },
  usedBy: { type: String },
});

export const Invite = model<IInvite>('Invite', inviteSchema);
