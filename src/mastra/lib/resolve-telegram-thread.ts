import { userRepository } from '../../business/repositories'
import type { IUser } from '../../business'

// Tipos estructurales mínimos sobre el storage de Mastra para que los tests
// puedan stubear sin arrastrar la instancia completa.
export type MemoryStoreLike = {
    listThreads: (args: {
        filter: { metadata: Record<string, string> }
        perPage: number
    }) => Promise<{ threads: Array<{ id: string }> }>
}
export type StorageLike = {
    getStore: (name: 'memory') => Promise<MemoryStoreLike | undefined>
}
export type MastraLike = {
    getStorage: () => StorageLike | undefined
}

export type ResolveTelegramThreadDeps = {
    getUserByEmail: (email: string) => Promise<IUser | null>
}

const defaultDeps: ResolveTelegramThreadDeps = {
    getUserByEmail: email => userRepository.findByEmail(email),
}

// Los suscriptores guardan solo el email canónico; el thread de entrega se
// resuelve acá al momento del envío. Un DM de Telegram tiene id externo
// determinístico `telegram:<telegramId>` y Mastra lo persiste en la metadata
// del thread interno (channel_externalThreadId) — el mismo lookup que hace el
// framework para los mensajes entrantes. Null = no hay dónde entregar (el
// usuario nunca habló con el bot): el caller loguea y saltea.
export function createResolveTelegramThread(deps: ResolveTelegramThreadDeps = defaultDeps) {
    return async (
        mastra: MastraLike | undefined,
        email: string,
    ): Promise<{ resourceId: string; threadId: string } | null> => {
        const user = await deps.getUserByEmail(email)
        if (!user?.telegramId) return null

        const memoryStore = await mastra?.getStorage()?.getStore('memory')
        if (!memoryStore) return null

        const { threads } = await memoryStore.listThreads({
            filter: { metadata: { channel_externalThreadId: `telegram:${user.telegramId}` } },
            perPage: 1,
        })
        const thread = threads[0]
        if (!thread) return null

        return { resourceId: email, threadId: thread.id }
    }
}

export const resolveTelegramThread = createResolveTelegramThread()
