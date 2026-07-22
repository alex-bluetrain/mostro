import type { ChannelHandler } from '@mastra/core/channels'
import { userRepository } from '../../business/repositories'
import type { IUser } from '../../business'

export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
}

const defaultDeps: TelegramGateDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
}

// Gate de acceso: corre antes de que el mensaje llegue al agente, así un
// desconocido no gasta tokens ni toca memoria. El canje de invitaciones vive
// en telegram-start.ts: los /start llegan como slash command, nunca como
// mensaje, así que acá no hay nada que parsear.
export function createTelegramGate(deps: TelegramGateDeps = defaultDeps): ChannelHandler {
    return async (thread, message, defaultHandler) => {
        const known = await deps.getUserByTelegramId(message.author.userId)
        if (!known) return
        await defaultHandler(thread, message)
    }
}
