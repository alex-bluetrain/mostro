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

  it('upsertFromInviteRedeem creates the user with the given name and telegram linked', async () => {
    const mockUser = { email: 'new@gmail.com', name: 'Ana', role: 'member' as const, telegramId: '42', addedAt: 123 };
    vi.mocked(User.findOneAndUpdate).mockResolvedValue(mockUser as any);

    const result = await userRepository.upsertFromInviteRedeem('New@Gmail.com', '42', 'Ana');

    expect(result).toEqual(mockUser);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'new@gmail.com' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ email: 'new@gmail.com', name: 'Ana', role: 'member' }),
        $set: { telegramId: '42' },
      }),
      { upsert: true, new: true }
    );
  });

  it('setNotifications flips the embedded preference and reports whether a user matched', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 1 } as any);

    const result = await userRepository.setNotifications('Ana@Gmail.com', true);

    expect(result).toBe(true);
    expect(User.updateOne).toHaveBeenCalledWith(
      { email: 'ana@gmail.com' },
      { $set: { 'preferences.notifications': true } }
    );
  });

  it('setNotifications returns false when the email is not a user', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 0 } as any);

    expect(await userRepository.setNotifications('ghost@gmail.com', true)).toBe(false);
  });

  it('listNotificationEmails only returns opted-in users', async () => {
    vi.mocked(User.find).mockReturnValue({
      lean: () => Promise.resolve([{ email: 'ana@gmail.com' }, { email: 'juan@gmail.com' }]),
    } as any);

    const result = await userRepository.listNotificationEmails();

    expect(result).toEqual(['ana@gmail.com', 'juan@gmail.com']);
    expect(User.find).toHaveBeenCalledWith({ 'preferences.notifications': true }, { email: 1 });
  });

  it('upsertFromInviteRedeem does not clobber an existing user (setOnInsert only)', async () => {
    const existingUser = { email: 'ana@gmail.com', name: 'Ana', role: 'admin' as const, telegramId: '99', addedAt: 5 };
    vi.mocked(User.findOneAndUpdate).mockResolvedValue(existingUser as any);

    const result = await userRepository.upsertFromInviteRedeem('Ana@Gmail.com', '99', 'Telegram Name');

    expect(result).toEqual(existingUser);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'ana@gmail.com' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ email: 'ana@gmail.com', name: 'Telegram Name', role: 'member' }),
        $set: { telegramId: '99' },
      }),
      { upsert: true, new: true }
    );
  });
});
