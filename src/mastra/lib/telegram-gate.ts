import type { ChannelHandler } from '@mastra/core/channels'
import { getUserByTelegramId, linkTelegramId, type User } from './users'
import { redeemInvite, type Invite } from './invites'

export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<User | null>
    redeemInvite: (code: string, telegramId: string) => Promise<Invite | null>
    linkTelegramId: (email: string, telegramId: string) => Promise<boolean>
}

const defaultDeps: TelegramGateDeps = { getUserByTelegramId, redeemInvite, linkTelegramId }

export function parseStartCode(text: string | undefined): string | null {
    if (!text) return null
    const match = /^\/start\s+([A-Za-z0-9_-]{6,})$/.exec(text.trim())
    return match ? match[1] : null
}

// Gate de acceso: corre antes de que el mensaje llegue al agente, así un
// desconocido no gasta tokens ni toca memoria
export function createTelegramGate(deps: TelegramGateDeps = defaultDeps): ChannelHandler {
    return async (thread, message, defaultHandler) => {
        const senderId = message.author.userId
        const known = await deps.getUserByTelegramId(senderId)
        if (known) {
            await defaultHandler(thread, message)
            return
        }

        const code = parseStartCode(message.text)
        if (!code) return

        const invite = await deps.redeemInvite(code, senderId)
        if (!invite) return

        // El user existe desde que se generó el invite; el canje solo vincula
        await deps.linkTelegramId(invite.email, senderId)
        await defaultHandler(thread, message)
    }
}
