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
});
