import { Schema, model } from 'mongoose';

export interface ISubscriber {
  type: 'diapers' | 'meds' | 'refunds';
  resourceId: string;
  threadId: string;
}

const subscriberSchema = new Schema<ISubscriber>({
  type: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true },
  resourceId: { type: String, required: true },
  threadId: { type: String, required: true },
});

// Idempotency guard: matches the current addSubscriber "insert if not present" check
subscriberSchema.index({ type: 1, resourceId: 1, threadId: 1 }, { unique: true });

export const Subscriber = model<ISubscriber>('Subscriber', subscriberSchema);
