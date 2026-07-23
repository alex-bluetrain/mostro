import { Schema, model } from 'mongoose';

export interface ISubscriber {
  type: 'diapers' | 'meds' | 'refunds';
  email: string;
}

const subscriberSchema = new Schema<ISubscriber>({
  type: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true },
  email: { type: String, required: true, lowercase: true },
});

// One subscription per user per domain; the delivery thread is resolved at
// send time (see resolve-telegram-thread), so no thread data is stored here.
subscriberSchema.index({ type: 1, email: 1 }, { unique: true });

export const Subscriber = model<ISubscriber>('Subscriber', subscriberSchema);
