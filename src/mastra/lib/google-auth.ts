import { MastraAuthGoogle } from '@mastra/auth-google'
import { appConfig } from '@config/app.config'
import { assertInvitedAndSyncName } from './invite-gate'
import { TELEGRAM_CHANNEL_WEBHOOK } from './jwt-auth'
import { appLogger } from './app-logger'

// Identidad verificada por Google directo: el cliente (Expo Android/web con
// PKCE, o cualquiera) manda el id_token de Google como Bearer y este provider
// lo verifica contra JWKS (firma RS256, iss, aud, exp). Sin clientSecret opera
// solo en modo Bearer: no hay SSO/cookie ni GOOGLE_COOKIE_PASSWORD.
//
// Que el token sea válido no alcanza para entrar: authorizeUser exige que el
// email exista en users, mismo invite gate que usa el JWT del BFF. No usamos
// allowedDomains a propósito: rechazaría cuentas Gmail (sin claim hd) y el gate
// real es la invitación, no el dominio.
export function createGoogleAuth(): MastraAuthGoogle | undefined {
    if (!appConfig.GOOGLE_CLIENT_ID) {
        appLogger.warn('[google-auth] GOOGLE_CLIENT_ID not set, google bearer auth disabled')
        return undefined
    }

    return new MastraAuthGoogle({
        clientId: appConfig.GOOGLE_CLIENT_ID,
        public: [TELEGRAM_CHANNEL_WEBHOOK],
        authorizeUser: async user => {
            const email = typeof user?.email === 'string' ? user.email : undefined
            if (!email) return false
            try {
                await assertInvitedAndSyncName({
                    email,
                    emailVerified: user.emailVerified,
                    name: typeof user.name === 'string' ? user.name : undefined,
                })
                return true
            } catch {
                return false
            }
        },
        // Misma resource id que Telegram y que el JWT del BFF (el email) para que
        // un usuario vea la misma memoria desde cualquier cliente.
        mapUserToResourceId: user => (typeof user?.email === 'string' ? user.email : undefined),
    })
}
