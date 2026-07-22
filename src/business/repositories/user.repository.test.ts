import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { userRepository } from './user.repository';
import { User } from '../models/user.model';

vi.mock('../models/user.model');

describe('UserRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findByEmail returns user or null', async () => {
    const mockUser = { email: 'test@gmail.com', name: 'Test', role: 'member' as const, addedAt: 123 };
    vi.mocked(User.findOne).mockResolvedValue(mockUser as any);

    const result = await userRepository.findByEmail('test@gmail.com');

    expect(result).toEqual(mockUser);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'test@gmail.com' });
  });

  it('linkTelegramId returns true if user matched', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 1 } as any);

    const result = await userRepository.linkTelegramId('test@gmail.com', '123456');

    expect(result).toBe(true);
  });

  it('linkTelegramId returns false if no user matched', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 0 } as any);

    const result = await userRepository.linkTelegramId('test@gmail.com', '123456');

    expect(result).toBe(false);
  });

  it('upsertFromInviteRedeem creates the user with telegram linked', async () => {
    const mockUser = { email: 'new@gmail.com', name: '', role: 'member' as const, telegramId: '42', addedAt: 123 };
    vi.mocked(User.findOneAndUpdate).mockResolvedValue(mockUser as any);

    const result = await userRepository.upsertFromInviteRedeem('New@Gmail.com', '42');

    expect(result).toEqual(mockUser);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'new@gmail.com' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ email: 'new@gmail.com', name: '', role: 'member' }),
        $set: { telegramId: '42' },
      }),
      { upsert: true, new: true }
    );
  });

  it('upsertFromInviteRedeem just links telegram when the user already exists', async () => {
    const existingUser = { email: 'ana@gmail.com', name: 'Ana', role: 'admin' as const, telegramId: '99', addedAt: 5 };
    vi.mocked(User.findOneAndUpdate).mockResolvedValue(existingUser as any);

    const result = await userRepository.upsertFromInviteRedeem('Ana@Gmail.com', '99');

    expect(result).toEqual(existingUser);
    // Same call shape regardless of whether the user pre-existed: $setOnInsert
    // only applies on insert (won't clobber name/role of the existing admin),
    // $set unconditionally links the telegramId — that split is the whole
    // point of the link-only semantics.
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'ana@gmail.com' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ email: 'ana@gmail.com', name: '', role: 'member' }),
        $set: { telegramId: '99' },
      }),
      { upsert: true, new: true }
    );
  });
});
