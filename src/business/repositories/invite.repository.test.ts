import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inviteRepository } from './invite.repository';
import { Invite } from '../models/invite.model';
import { userRepository } from './user.repository';

vi.mock('../models/invite.model');
vi.mock('./user.repository', () => ({
  userRepository: { upsertUser: vi.fn().mockResolvedValue(undefined) },
}));

describe('InviteRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create provisions the user and creates an invite with code and expiry', async () => {
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

    expect(userRepository.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@gmail.com', role: 'member' })
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
