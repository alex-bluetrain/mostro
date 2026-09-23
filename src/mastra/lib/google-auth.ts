import { MastraAuthGoogle } from '@mastra/auth-google'
import { appConfig } from '@config/app.config'
import { assertInvitedAndSyncName } from './invite-gate'
import { TELEGRAM_CHANNEL_WEBHOOK } from './server-auth'
import { appLogger } from './app-logger'

// Identidad verificada por Google directo: el cliente (Expo Android/web con
// PKCE, o cualquiera) manda el id_token de Google como Bearer y este provider
// lo verifica contra JWKS (firma RS256, iss, aud, exp). Sin clientSecret opera
// Bearer mode only: no SSO/cookie, no GOOGLE_COOKIE_PASSWORD.
//
// A valid token is not enough to get in: authorizeUser requires the email to
// exist in users, the same invite gate every provider shares. We deliberately
// skip allowedDomains: it would reject Gmail accounts (no hd claim), and the
// real gate is the invitation, not the domain.
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
        // Same resource id as Telegram (the email) so a user sees the same
        // memory from any client.
        mapUserToResourceId: user => (typeof user?.email === 'string' ? user.email : undefined),
    })
}
