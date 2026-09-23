import { SimpleAuth, CompositeAuth } from '@mastra/core/server'
import { appConfig } from '@config/app.config'
import { createGoogleAuth } from './google-auth'
import { appLogger } from './app-logger'

// El webhook del canal Telegram vive bajo /api/* (protegido por default del
// middleware de auth) pero ya tiene su propia protección vía
// TELEGRAM_WEBHOOK_SECRET_TOKEN, así que debe quedar público o el bot muere.
export const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

// Dos formas de entrar, ambas por bearer token y ninguna gateada por licencia
// EE (el gate sólo cubre login UI: SSO y credenciales, que acá no usamos):
// - id_token de Google directo → clientes con PKCE (Expo), verificado vs JWKS.
// - SimpleAuth con STUDIO_API_KEY → Studio, un único token de admin.
//
// CompositeAuth prueba los providers en orden y gana el primero que autentica;
// unifica los `public` de todos, así que el webhook de Telegram sigue abierto.
//
// Si sumás entradas a SimpleAuth, tené en cuenta que authorizeUser() acepta
// cualquier token del mapa para todo: no hay permisos por ruta ni por rol, y el
// mapa se congela en el boot (alta/baja de un usuario implica reiniciar).
export function createServerAuth() {
    const googleAuth = createGoogleAuth()

    const studioAuth = appConfig.STUDIO_API_KEY
        ? new SimpleAuth({
            tokens: {
                [appConfig.STUDIO_API_KEY]: {
                    // El id ES el resourceId (ver mapUserToResourceId abajo). Cuando
                    // hay ADMIN_EMAIL, lo usamos para que el token resuelva al IUser
                    // real en Mongo (resolveRequestUser sólo busca si contiene '@'):
                    // así /users/me responde y isRequestAdmin ve el role real, en vez
                    // del literal 'admin' que no matchea ningún usuario de negocio.
                    id: appConfig.ADMIN_EMAIL ?? 'admin',
                    name: appConfig.ADMIN_NAME ?? 'Admin',
                    role: 'admin',
                },
            },
            public: [TELEGRAM_CHANNEL_WEBHOOK],
            // Sin esto, SimpleAuth autentica pero no puebla MASTRA_RESOURCE_ID_KEY,
            // y webThreadMiddleware corta con 401. El resource id fija la memoria
            // del admin (con ADMIN_EMAIL, comparte hilo/memoria con el mismo usuario
            // logueado por Google; sin él, hilo propio 'admin' separado).
            mapUserToResourceId: user => user.id,
        })
        : undefined

    const providers = [googleAuth, studioAuth].filter(p => p !== undefined)

    if (providers.length === 0) {
        // Sin providers el server queda abierto, así que es un error de config
        // que conviene que duela en el boot y no en el primer request.
        throw new Error('[server-auth] no auth provider configured: set GOOGLE_CLIENT_ID and/or STUDIO_API_KEY')
    }

    if (providers.length === 1) return providers[0]

    appLogger.info(`[server-auth] auth enabled: ${providers.length} providers`)
    return new CompositeAuth(providers)
}
