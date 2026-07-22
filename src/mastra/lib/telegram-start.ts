import { userRepository, inviteRepository } from '../../business/repositories'
import type { IUser, IInvite } from '../../business'

export type TelegramStartDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    redeemInvite: (code: string, telegramId: string) => Promise<IInvite | null>
    provisionUser: (email: string, telegramId: string) => Promise<IUser>
}

const defaultDeps: TelegramStartDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    redeemInvite: (code, telegramId) => inviteRepository.redeem(code, telegramId),
    provisionUser: (email, telegramId) => userRepository.upsertFromInviteRedeem(email, telegramId),
}

// Subconjunto estructural de SlashCommandEvent del Chat SDK: alcanza para el
// handler y permite testearlo sin fabricar un evento completo.
export type TelegramStartEvent = {
    user: { userId: string }
    text: string
    channel: { post: (message: string) => Promise<unknown> }
}

export const KNOWN_USER_GREETING = '¡Hola de nuevo! Contame en qué te ayudo.'
export const INVALID_INVITE_MESSAGE =
    'No tengo una invitación válida para vos. Pedile a quien te invitó que te genere un link nuevo.'

export function buildWelcomeMessage(name?: string): string {
    const greeting = name ? `¡Hola, ${name}!` : '¡Hola!'
    const intro =
        'Soy Mostro: te ayudo con los pedidos de pañales, medicamentos y reintegros, y te aviso cuando hay novedades.'
    return name ? `${greeting} ${intro}` : `${greeting} ${intro} Para arrancar, ¿cómo te llamás?`
}

// El adapter de telegram desvía los bot_command al pipeline de slash commands
// del Chat SDK, así que el canje de invitaciones vive acá y no en el gate de
// onDirectMessage (que nunca ve los /start).
export function createTelegramStartHandler(deps: TelegramStartDeps = defaultDeps) {
    return async (event: TelegramStartEvent): Promise<void> => {
        try {
            const telegramId = event.user.userId
            const known = await deps.getUserByTelegramId(telegramId)
            if (known) {
                await event.channel.post(KNOWN_USER_GREETING)
                return
            }
            const code = event.text.trim()
            if (!code) {
                await event.channel.post(INVALID_INVITE_MESSAGE)
                return
            }
            const invite = await deps.redeemInvite(code, telegramId)
            if (!invite) {
                await event.channel.post(INVALID_INVITE_MESSAGE)
                return
            }
            const user = await deps.provisionUser(invite.email, telegramId)
            await event.channel.post(buildWelcomeMessage(user.name || invite.name))
        } catch (err) {
            console.error('[telegram-start] failed to handle /start', err)
        }
    }
}
