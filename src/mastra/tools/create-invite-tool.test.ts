import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config/app.config', () => ({
  appConfig: { TELEGRAM_BOT_USERNAME: 'mostro_bot' },
}));
vi.mock('../../business/repositories', () => ({
  inviteRepository: { create: vi.fn() },
  userRepository: { findByEmail: vi.fn() },
}));
vi.mock('../../business/identity', () => ({
  getUserByResourceId: vi.fn(),
}));

import { createInviteTool } from './create-invite-tool';
import { inviteRepository, userRepository } from '../../business/repositories';
import { getUserByResourceId } from '../../business/identity';

const admin = { email: 'admin@gmail.com', name: 'Admin', role: 'admin' as const, addedAt: 1 };
const invite = { code: 'abc123', email: 'new@gmail.com', createdBy: 'admin@gmail.com', createdAt: 1, expiresAt: 999 };

function run(input: { email: string }, resourceId = 'admin@gmail.com') {
  return (createInviteTool.execute as any)(input, { agent: { resourceId } });
}

describe('createInviteTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserByResourceId).mockResolvedValue(admin);
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(inviteRepository.create).mockResolvedValue(invite as any);
  });

  it('rejects non-admin callers', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ ...admin, role: 'member' });
    const result = await run({ email: 'new@gmail.com' });
    expect(result.ok).toBe(false);
    expect(inviteRepository.create).not.toHaveBeenCalled();
  });

  it('rejects emails that already belong to an active user', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue({ ...admin, telegramId: '42' } as any);
    const result = await run({ email: 'admin@gmail.com' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already/);
    expect(inviteRepository.create).not.toHaveBeenCalled();
  });

  it('creates the invite and returns the telegram link', async () => {
    const result = await run({ email: 'new@gmail.com' });

    expect(inviteRepository.create).toHaveBeenCalledWith({ createdBy: 'admin@gmail.com', email: 'new@gmail.com' });
    expect(result).toMatchObject({ ok: true, link: 'https://t.me/mostro_bot?start=abc123', expiresAt: 999 });
  });
});
