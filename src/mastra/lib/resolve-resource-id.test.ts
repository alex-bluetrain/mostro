import { describe, it, expect, vi } from 'vitest';
import { createResolveResourceId } from './resolve-resource-id';

const user = { email: 'ana@gmail.com', name: 'Ana', role: 'member' as const, addedAt: 1 };

function makeArgs(userId = '12345') {
  return { message: { author: { userId } } } as any;
}

describe('createResolveResourceId', () => {
  it('resolves the author to their email', async () => {
    const resolve = createResolveResourceId({
      getUserByTelegramId: vi.fn().mockResolvedValue(user),
    });
    await expect(resolve(makeArgs())).resolves.toBe('ana@gmail.com');
  });

  it('throws when no user matches the telegramId', async () => {
    const resolve = createResolveResourceId({
      getUserByTelegramId: vi.fn().mockResolvedValue(null),
    });
    await expect(resolve(makeArgs('999'))).rejects.toThrow(/999/);
  });
});
