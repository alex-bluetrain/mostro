import { Schema, model } from 'mongoose';

export interface ISubscriber {
  domain: 'diapers' | 'meds' | 'refunds';
  email?: string;
  telegramId?: string;
  addedAt: number;
}

const subscriberSchema = new Schema<ISubscriber>({
  domain: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true },
  email: { type: String, lowercase: true },
  telegramId: { type: String },
  addedAt: { type: Number, required: true },
});

// Compound unique index: one subscriber per (domain, email) or (domain, telegramId)
subscriberSchema.index({ domain: 1, email: 1 }, { unique: true, sparse: true });
subscriberSchema.index({ domain: 1, telegramId: 1 }, { unique: true, sparse: true });

export const Subscriber = model<ISubscriber>('Subscriber', subscriberSchema);
