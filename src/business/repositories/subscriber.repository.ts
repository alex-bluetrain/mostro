import { Subscriber } from '../models/subscriber.model';

export class SubscriberRepository {
  async add(email: string): Promise<void> {
    // Upsert keeps the idempotency check atomic (no find-then-insert race).
    await Subscriber.updateOne(
      { email },
      { $setOnInsert: { email } },
      { upsert: true }
    );
  }

  async list(): Promise<string[]> {
    const docs = await Subscriber.find().lean();
    return docs.map(({ email }) => email);
  }
}

export const subscriberRepository = new SubscriberRepository();
