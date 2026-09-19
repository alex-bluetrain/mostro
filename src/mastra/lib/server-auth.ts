import { SimpleAuth, CompositeAuth } from '@mastra/core/server'
import { appConfig } from '@config/app.config'
import { createJwtAuth, TELEGRAM_CHANNEL_WEBHOOK } from './jwt-auth'
import { createGoogleAuth } from './google-auth'
import { appLogger } from './app-logger'

// Tres formas de entrar, todas por bearer token y ninguna gateada por licencia
// EE (el gate sólo cubre login UI: SSO y credenciales, que acá no usamos):
// - JWT firmado por el BFF de mostro-web → usuarios finales, identidad = email.
// - id_token de Google directo → clientes con PKCE (Expo), verificado vs JWKS.
// - SimpleAuth con STUDIO_API_KEY → Studio, un único token de admin.
//
// CompositeAuth prueba los providers en orden y gana el primero que autentica;
// unifica los `public` de todos, así que el webhook de Telegram sigue abierto.
// El JWT va primero porque es el camino de todos los requests de mostro-web; un
// id_token de Google falla la verificación HS256 del JWT y cae al de Google.
//
// Si sumás entradas a SimpleAuth, tené en cuenta que authorizeUser() acepta
// cualquier token del mapa para todo: no hay permisos por ruta ni por rol, y el
// mapa se congela en el boot (alta/baja de un usuario implica reiniciar).
export function createServerAuth() {
    const jwtAuth = createJwtAuth()
    const googleAuth = createGoogleAuth()

    const studioAuth = appConfig.STUDIO_API_KEY
        ? new SimpleAuth({
            tokens: {
                [appConfig.STUDIO_API_KEY]: {
                    id: 'admin',
                    name: appConfig.ADMIN_NAME ?? 'Admin',
                    role: 'admin',
                },
            },
            public: [TELEGRAM_CHANNEL_WEBHOOK],
        })
        : undefined

    const providers = [jwtAuth, googleAuth, studioAuth].filter(p => p !== undefined)

    if (providers.length === 0) {
        // Sin providers el server queda abierto, así que es un error de config
        // que conviene que duela en el boot y no en el primer request.
        throw new Error('[server-auth] no auth provider configured: set MOSTRO_JWT_SECRET, GOOGLE_CLIENT_ID and/or STUDIO_API_KEY')
    }

    if (providers.length === 1) return providers[0]

    appLogger.info(`[server-auth] auth enabled: ${providers.length} providers`)
    return new CompositeAuth(providers)
}
