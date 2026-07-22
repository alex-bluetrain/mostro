import { Subscriber } from '../models/subscriber.model';

type Domain = 'diapers' | 'meds' | 'refunds';
export type SubscriberEntry = { resourceId: string; threadId: string };

export class SubscriberRepository {
  async add(domain: Domain, entry: SubscriberEntry): Promise<void> {
    // Upsert with $setOnInsert reproduces the old find-then-insert idempotency
    // check atomically (no race between the check and the insert).
    await Subscriber.updateOne(
      { type: domain, resourceId: entry.resourceId, threadId: entry.threadId },
      { $setOnInsert: { type: domain, ...entry } },
      { upsert: true }
    );
  }

  async list(domain: Domain): Promise<SubscriberEntry[]> {
    const docs = await Subscriber.find({ type: domain }).lean();
    return docs.map(({ resourceId, threadId }) => ({ resourceId, threadId }));
  }
}

export const subscriberRepository = new SubscriberRepository();
