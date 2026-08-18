import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import type { Middleware } from '@mastra/core/server'
import { channelThreadId } from './channel-thread-id'

// `Middleware` es la unión del handler y su forma con `path`; las rutas sólo
// aceptan el handler pelado.
type MiddlewareHandler = Extract<Middleware, { handler: unknown }>['handler']

// El threadId no puede venir del browser: quien lo mande elige qué memoria
// lee. Lo derivamos del resourceId que el auth ya resolvió desde la firma del
// JWT, en un middleware de ruta —corre después del middleware de auth y sobre
// el mismo RequestContext, así que el email ya está puesto.
export const webThreadMiddleware: MiddlewareHandler = async (c, next) => {
    const requestContext = c.get('requestContext')
    const resourceId = requestContext?.get(MASTRA_RESOURCE_ID_KEY)

    if (typeof resourceId !== 'string' || !resourceId) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    requestContext.set(MASTRA_THREAD_ID_KEY, channelThreadId(resourceId, 'web'))
    await next()
}
