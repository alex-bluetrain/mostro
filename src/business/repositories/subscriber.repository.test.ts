import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subscriberRepository } from './subscriber.repository';
import { Subscriber } from '../models/subscriber.model';

vi.mock('../models/subscriber.model');

describe('SubscriberRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('add upserts by type+resourceId+threadId', async () => {
    vi.mocked(Subscriber.updateOne).mockResolvedValue({} as any);

    await subscriberRepository.add('diapers', { resourceId: 'r1', threadId: 't1' });

    expect(Subscriber.updateOne).toHaveBeenCalledWith(
      { type: 'diapers', resourceId: 'r1', threadId: 't1' },
      { $setOnInsert: { type: 'diapers', resourceId: 'r1', threadId: 't1' } },
      { upsert: true }
    );
  });

  it('list returns resourceId/threadId pairs for a domain', async () => {
    const mockDocs = [{ type: 'diapers', resourceId: 'r1', threadId: 't1' }];
    vi.mocked(Subscriber.find).mockReturnValue({ lean: () => Promise.resolve(mockDocs) } as any);

    const result = await subscriberRepository.list('diapers');

    expect(result).toEqual([{ resourceId: 'r1', threadId: 't1' }]);
    expect(Subscriber.find).toHaveBeenCalledWith({ type: 'diapers' });
  });
});
