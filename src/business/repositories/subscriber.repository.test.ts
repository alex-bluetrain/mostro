import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subscriberRepository } from './subscriber.repository';
import { Subscriber } from '../models/subscriber.model';

vi.mock('../models/subscriber.model');

describe('SubscriberRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('add upserts by email', async () => {
    vi.mocked(Subscriber.updateOne).mockResolvedValue({} as any);

    await subscriberRepository.add('ana@gmail.com');

    expect(Subscriber.updateOne).toHaveBeenCalledWith(
      { email: 'ana@gmail.com' },
      { $setOnInsert: { email: 'ana@gmail.com' } },
      { upsert: true }
    );
  });

  it('list returns every subscriber email', async () => {
    const mockDocs = [{ email: 'ana@gmail.com' }, { email: 'juan@gmail.com' }];
    vi.mocked(Subscriber.find).mockReturnValue({ lean: () => Promise.resolve(mockDocs) } as any);

    const result = await subscriberRepository.list();

    expect(result).toEqual(['ana@gmail.com', 'juan@gmail.com']);
    expect(Subscriber.find).toHaveBeenCalledWith();
  });
});
