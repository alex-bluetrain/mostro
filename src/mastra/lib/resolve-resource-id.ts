import { userRepository } from '../../business/repositories'
import type { IUser } from '../../business'

export type ResolveResourceIdDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
}

const defaultDeps: ResolveResourceIdDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
}

// Memoria canónica: todo thread queda a nombre del email del usuario, así la
// futura web comparte memoria. El gate rechaza desconocidos antes de llegar
// acá, así que un lookup fallido es un bug o un fallo de DB: se lanza para que
// sea ruidoso en vez de crear un thread huérfano con un id no canónico.
export function createResolveResourceId(deps: ResolveResourceIdDeps = defaultDeps) {
    return async ({ message }: { message: { author: { userId: string } } }): Promise<string> => {
        const user = await deps.getUserByTelegramId(message.author.userId)
        if (!user) {
            throw new Error(`[resolve-resource-id] no user for telegramId ${message.author.userId}`)
        }
        return user.email
    }
}
