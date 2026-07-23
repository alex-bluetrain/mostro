import { describe, it, expect, vi } from 'vitest';
import { createResolveTelegramThread } from './resolve-telegram-thread';

const user = { email: 'ana@gmail.com', name: 'Ana', role: 'member' as const, addedAt: 1, telegramId: '555' };

function makeMastra(threads: Array<{ id: string }>) {
    const listThreads = vi.fn().mockResolvedValue({ threads });
    const mastra = {
        getStorage: () => ({ getStore: async () => ({ listThreads }) }),
    };
    return { mastra: mastra as any, listThreads };
}

describe('createResolveTelegramThread', () => {
    it('resolves the email to the telegram-bound thread', async () => {
        const { mastra, listThreads } = makeMastra([{ id: 'thread-1' }]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(user),
        });

        await expect(resolve(mastra, 'ana@gmail.com')).resolves.toEqual({
            resourceId: 'ana@gmail.com',
            threadId: 'thread-1',
        });
        expect(listThreads).toHaveBeenCalledWith({
            filter: { metadata: { channel_externalThreadId: 'telegram:555' } },
            perPage: 1,
        });
    });

    it('returns null when no user matches the email', async () => {
        const { mastra } = makeMastra([{ id: 'thread-1' }]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(null),
        });

        await expect(resolve(mastra, 'nadie@gmail.com')).resolves.toBeNull();
    });

    it('returns null when the user has no telegramId', async () => {
        const { mastra } = makeMastra([{ id: 'thread-1' }]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue({ ...user, telegramId: undefined }),
        });

        await expect(resolve(mastra, 'ana@gmail.com')).resolves.toBeNull();
    });

    it('returns null when no thread matches the external id', async () => {
        const { mastra } = makeMastra([]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(user),
        });

        await expect(resolve(mastra, 'ana@gmail.com')).resolves.toBeNull();
    });

    it('returns null when storage is unavailable', async () => {
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(user),
        });

        await expect(resolve(undefined, 'ana@gmail.com')).resolves.toBeNull();
    });
});
