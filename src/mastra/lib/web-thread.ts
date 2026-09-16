import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import type { Middleware } from '@mastra/core/server'
import { channelThreadId } from './channel-thread-id'

// `Middleware` es la unión del handler y su forma con `path`; las rutas sólo
// aceptan el handler pelado.
type MiddlewareHandler = Extract<Middleware, { handler: unknown }>['handler']

// Marca de canal para el prompt dinámico del supervisor. La ponemos acá, en la
// única puerta por la que entra el browser: si algún día hay otro canal, no
// hereda OpenUI por accidente —tiene que pedirlo explícitamente.
export const CHANNEL_KEY = 'mostro.channel'

export const webThreadMiddleware: MiddlewareHandler = async (c, next) => {
    const requestContext = c.get('requestContext')
    const resourceId = requestContext?.get(MASTRA_RESOURCE_ID_KEY)

    if (typeof resourceId !== 'string' || !resourceId) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    requestContext.set(MASTRA_THREAD_ID_KEY, channelThreadId(resourceId, 'web'))
    requestContext.set(CHANNEL_KEY, 'web')
    await next()
}
