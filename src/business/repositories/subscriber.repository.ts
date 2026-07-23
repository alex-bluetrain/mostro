import { Subscriber } from '../models/subscriber.model';

type Domain = 'diapers' | 'meds' | 'refunds';

export class SubscriberRepository {
  async add(domain: Domain, email: string): Promise<void> {
    // Upsert keeps the idempotency check atomic (no find-then-insert race).
    await Subscriber.updateOne(
      { type: domain, email },
      { $setOnInsert: { type: domain, email } },
      { upsert: true }
    );
  }

  async list(domain: Domain): Promise<string[]> {
    const docs = await Subscriber.find({ type: domain }).lean();
    return docs.map(({ email }) => email);
  }
}

export const subscriberRepository = new SubscriberRepository();
