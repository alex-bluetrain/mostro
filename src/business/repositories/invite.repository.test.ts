import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inviteRepository } from './invite.repository';
import { Invite } from '../models/invite.model';

vi.mock('../models/invite.model');

describe('InviteRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create only creates the invite document, without provisioning a user', async () => {
    const mockInvite = {
      code: 'abc123',
      email: 'test@gmail.com',
      createdBy: 'admin@gmail.com',
      createdAt: 1000,
      expiresAt: 1000 + 7 * 24 * 60 * 60,
      toObject() {
        return this;
      },
    };
    vi.mocked(Invite.create).mockResolvedValue(mockInvite as any);

    const result = await inviteRepository.create({ createdBy: 'admin@gmail.com', email: 'Test@Gmail.com' });

    expect(Invite.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@gmail.com', createdBy: 'admin@gmail.com' })
    );
    expect(result.code).toBe('abc123');
  });

  it('redeem matches only unused, unexpired invites and marks them used', async () => {
    const mockInvite = { code: 'abc123', email: 'test@gmail.com', usedBy: '999' };
    vi.mocked(Invite.findOneAndUpdate).mockResolvedValue(mockInvite as any);

    const result = await inviteRepository.redeem('abc123', '999');

    expect(result).toEqual(mockInvite);
    expect(Invite.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'abc123', usedBy: { $exists: false } }),
      { $set: { usedBy: '999' } },
      { new: true }
    );
  });
});
