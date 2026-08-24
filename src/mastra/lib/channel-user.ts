import { userRepository } from '@business/repositories'
import type { IUser } from '@business'

export type ChannelUserDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    getUserByDiscordId: (discordId: string) => Promise<IUser | null>
}

export const defaultChannelUserDeps: ChannelUserDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    getUserByDiscordId: discordId => userRepository.findByDiscordId(discordId),
}

// Traduce (plataforma, id del autor) al usuario de Mongo, que es la fuente de
// verdad. Telegram es el canal de alta: todo usuario tiene telegramId. Discord
// es opcional y se vincula después, así que un id de Discord sin dueño es un
// usuario que todavía no corrió link-discord, no un error.
//
// Una plataforma desconocida devuelve null a propósito: si mañana se enchufa un
// adapter nuevo sin mapear su identidad, el gate lo rechaza en vez de dejar
// entrar a cualquiera.
export async function findChannelUser(
    deps: ChannelUserDeps,
    platform: string,
    userId: string
): Promise<IUser | null> {
    if (platform === 'telegram') return deps.getUserByTelegramId(userId)
    if (platform === 'discord') return deps.getUserByDiscordId(userId)
    return null
}
