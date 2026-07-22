import type { ChannelHandler } from '@mastra/core/channels'
import { userRepository, inviteRepository } from '../../business/repositories'
import type { IUser, IInvite } from '../../business'

export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    redeemInvite: (code: string, telegramId: string) => Promise<IInvite | null>
    linkTelegramId: (email: string, telegramId: string) => Promise<boolean>
}

const defaultDeps: TelegramGateDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    redeemInvite: (code, telegramId) => inviteRepository.redeem(code, telegramId),
    linkTelegramId: (email, telegramId) => userRepository.linkTelegramId(email, telegramId),
}

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
        const linked = await deps.linkTelegramId(invite.email, senderId)
        if (!linked) {
            console.warn(`[telegram-gate] invite ${invite.code} redeemed but no user found for ${invite.email}`)
            return
        }
        await defaultHandler(thread, message)
    }
}
