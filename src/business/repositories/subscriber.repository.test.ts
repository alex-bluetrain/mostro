import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subscriberRepository } from './subscriber.repository';
import { Subscriber } from '../models/subscriber.model';

vi.mock('../models/subscriber.model');

describe('SubscriberRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('add upserts by type+email', async () => {
    vi.mocked(Subscriber.updateOne).mockResolvedValue({} as any);

    await subscriberRepository.add('diapers', 'ana@gmail.com');

    expect(Subscriber.updateOne).toHaveBeenCalledWith(
      { type: 'diapers', email: 'ana@gmail.com' },
      { $setOnInsert: { type: 'diapers', email: 'ana@gmail.com' } },
      { upsert: true }
    );
  });

  it('list returns emails for a domain', async () => {
    const mockDocs = [{ type: 'diapers', email: 'ana@gmail.com' }];
    vi.mocked(Subscriber.find).mockReturnValue({ lean: () => Promise.resolve(mockDocs) } as any);

    const result = await subscriberRepository.list('diapers');

    expect(result).toEqual(['ana@gmail.com']);
    expect(Subscriber.find).toHaveBeenCalledWith({ type: 'diapers' });
  });
});
