import type { ChannelHandler } from '@mastra/core/channels'
import { findChannelUser, defaultChannelUserDeps, type ChannelUserDeps } from './channel-user'

export type ChannelGateDeps = ChannelUserDeps

// Gate de acceso: corre antes de que el mensaje llegue al agente, así un
// desconocido no gasta tokens ni toca memoria. Cubre todos los adapters: la
// plataforma sale de thread.adapter.name, porque los handlers se registran una
// sola vez para todo el canal y no reciben el platform por parámetro.
//
// El canje de invitaciones vive en telegram-start.ts: los /start llegan como
// slash command, nunca como mensaje, así que acá no hay nada que parsear.
export function createChannelGate(deps: ChannelGateDeps = defaultChannelUserDeps): ChannelHandler {
    return async (thread, message, defaultHandler) => {
        const known = await findChannelUser(deps, thread.adapter.name, message.author.userId)
        if (!known) return
        await defaultHandler(thread, message)
    }
}
