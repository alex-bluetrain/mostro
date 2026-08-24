import { describe, it, expect, vi } from 'vitest';
import { createResolveResourceId } from './resolve-resource-id';
import type { ResolveResourceIdDeps } from './resolve-resource-id';

const user = { email: 'ana@gmail.com', name: 'Ana', role: 'member' as const, addedAt: 1 };

function makeDeps(overrides: Partial<ResolveResourceIdDeps> = {}): ResolveResourceIdDeps {
  return {
    getUserByTelegramId: vi.fn().mockResolvedValue(null),
    getUserByDiscordId: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeArgs(userId = '12345', platform = 'telegram') {
  return { platform, message: { author: { userId } } } as any;
}

describe('createResolveResourceId', () => {
  it('resolves the author to their email', async () => {
    const resolve = createResolveResourceId(
      makeDeps({ getUserByTelegramId: vi.fn().mockResolvedValue(user) })
    );
    await expect(resolve(makeArgs())).resolves.toBe('ana@gmail.com');
  });

  it('throws when no user matches the telegramId', async () => {
    const resolve = createResolveResourceId(makeDeps());
    await expect(resolve(makeArgs('999'))).rejects.toThrow(/999/);
  });

  // Lo que hace que Telegram y Discord compartan memoria: dos plataformas, dos
  // ids distintos, un mismo resourceId canónico.
  it('resolves the same person to one resourceId across channels', async () => {
    const resolve = createResolveResourceId(
      makeDeps({
        getUserByTelegramId: vi.fn().mockResolvedValue(user),
        getUserByDiscordId: vi.fn().mockResolvedValue(user),
      })
    );
    const fromTelegram = await resolve(makeArgs('12345', 'telegram'));
    const fromDiscord = await resolve(makeArgs('999999999999999999', 'discord'));
    expect(fromDiscord).toBe(fromTelegram);
  });

  it('looks up discord senders by discordId', async () => {
    const getUserByDiscordId = vi.fn().mockResolvedValue(user);
    const deps = makeDeps({ getUserByDiscordId });
    await createResolveResourceId(deps)(makeArgs('999999999999999999', 'discord'));
    expect(getUserByDiscordId).toHaveBeenCalledWith('999999999999999999');
    expect(deps.getUserByTelegramId).not.toHaveBeenCalled();
  });
});
