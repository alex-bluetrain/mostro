import { findChannelUser, defaultChannelUserDeps, type ChannelUserDeps } from './channel-user'

export type ResolveResourceIdDeps = ChannelUserDeps

// Memoria canónica: todo thread queda a nombre del email del usuario, así la
// web y cada canal de chat comparten memoria. Un usuario que escribe por
// Telegram y por Discord aterriza en el mismo resourceId.
//
// El gate rechaza desconocidos antes de llegar acá, así que un lookup fallido
// es un bug o un fallo de DB: se lanza para que sea ruidoso en vez de crear un
// thread huérfano con un id no canónico.
export function createResolveResourceId(deps: ResolveResourceIdDeps = defaultChannelUserDeps) {
    return async ({
        platform,
        message,
    }: {
        platform: string
        message: { author: { userId: string } }
    }): Promise<string> => {
        const user = await findChannelUser(deps, platform, message.author.userId)
        if (!user) {
            throw new Error(`[resolve-resource-id] no user for ${platform} id ${message.author.userId}`)
        }
        return user.email
    }
}
