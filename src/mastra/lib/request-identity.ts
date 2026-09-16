import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'
import type { RequestContext } from '@mastra/core/request-context'
import { userRepository } from '@business/repositories'
import { findChannelUser, defaultChannelUserDeps, type ChannelUserDeps } from './channel-user'
import type { IUser } from '@business'

export type RequestIdentityDeps = ChannelUserDeps & {
    getUserByEmail: (email: string) => Promise<IUser | null>
}

export const defaultRequestIdentityDeps: RequestIdentityDeps = {
    ...defaultChannelUserDeps,
    getUserByEmail: email => userRepository.findByEmail(email),
}

// La identidad puede venir por dos puertas:
// - Web: el auth middleware pone el email (resourceId canónico) en
//   MASTRA_RESOURCE_ID_KEY.
// - Canales de chat: el pipeline pone ChannelContext (platform + userId) bajo
//   la key 'channel' antes de correr los input processors.
//
// El lookup se cachea por RequestContext: el filter del ToolSearchProcessor
// corre por cada tool candidata de una búsqueda, y el resolver de skills corre
// aparte — sin cache serían N hits a Mongo por request.
const cache = new WeakMap<RequestContext, Promise<IUser | null>>()

export function resolveRequestUser(
    requestContext: RequestContext | undefined,
    deps: RequestIdentityDeps = defaultRequestIdentityDeps
): Promise<IUser | null> {
    if (!requestContext) return Promise.resolve(null)

    const cached = cache.get(requestContext)
    if (cached) return cached

    const promise = lookup(requestContext, deps)
    cache.set(requestContext, promise)
    return promise
}

async function lookup(requestContext: RequestContext, deps: RequestIdentityDeps): Promise<IUser | null> {
    const resourceId = requestContext.get(MASTRA_RESOURCE_ID_KEY)
    if (typeof resourceId === 'string' && resourceId.includes('@')) {
        return deps.getUserByEmail(resourceId.trim().toLowerCase())
    }

    const channel = requestContext.get('channel') as { platform?: string; userId?: string } | undefined
    if (channel?.platform && channel.userId) {
        return findChannelUser(deps, channel.platform, channel.userId)
    }

    return null
}

export async function isRequestAdmin(
    requestContext: RequestContext | undefined,
    deps: RequestIdentityDeps = defaultRequestIdentityDeps
): Promise<boolean> {
    const user = await resolveRequestUser(requestContext, deps)
    return user?.role === 'admin'
}
