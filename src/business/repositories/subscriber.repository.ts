import { Subscriber, type ISubscriber } from '../models/subscriber.model';
import { nowUnix } from '../../mastra/lib/unix-time';

type Domain = 'diapers' | 'meds' | 'refunds';

export class SubscriberRepository {
  async findByEmail(domain: Domain, email: string): Promise<ISubscriber | null> {
    return Subscriber.findOne({ domain, email: email.toLowerCase() });
  }

  async findByTelegramId(domain: Domain, telegramId: string): Promise<ISubscriber | null> {
    return Subscriber.findOne({ domain, telegramId });
  }

  async subscribe(domain: Domain, email?: string, telegramId?: string): Promise<ISubscriber> {
    if (!email && !telegramId) {
      throw new Error('Either email or telegramId must be provided');
    }
    const result = await Subscriber.findOneAndUpdate(
      { domain, ...(email ? { email: email.toLowerCase() } : { telegramId }) },
      { $setOnInsert: { domain, email: email?.toLowerCase(), telegramId, addedAt: nowUnix() } },
      { upsert: true, new: true }
    );
    if (!result) throw new Error('Failed to subscribe');
    return result;
  }

  async unsubscribe(domain: Domain, email?: string, telegramId?: string): Promise<boolean> {
    if (!email && !telegramId) {
      throw new Error('Either email or telegramId must be provided');
    }
    const result = await Subscriber.deleteOne({
      domain,
      ...(email ? { email: email.toLowerCase() } : { telegramId }),
    });
    return result.deletedCount > 0;
  }

  async count(domain: Domain): Promise<number> {
    return Subscriber.countDocuments({ domain });
  }
}

export const subscriberRepository = new SubscriberRepository();
