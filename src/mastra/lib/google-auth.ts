import { MastraAuthGoogle, type GoogleUser } from '@mastra/auth-google'
import { appConfig } from '../config/app.config'
import { userRepository } from '../../business/repositories'
import { assertInvitedAndSyncName } from './google-auth-gate'

// El webhook del canal Telegram vive bajo /api/* (protegido por default del
// middleware de auth) pero ya tiene su propia protección vía
// TELEGRAM_WEBHOOK_SECRET_TOKEN, así que debe quedar público o el bot muere
const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

// handleCallback es una propiedad de instancia asignada por attachSSOProvider()
// en el constructor (no un método de la clase), así que se envuelve la
// propiedad: un override de subclase quedaría sombreado.
type SSOCallback = (code: string, state: string) => Promise<{ user: GoogleUser }>

export function createGoogleAuth(): MastraAuthGoogle | undefined {
    if (!appConfig.GOOGLE_CLIENT_ID || !appConfig.GOOGLE_CLIENT_SECRET) {
        console.warn('[google-auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set, server auth disabled')
        return undefined
    }

    const auth = new MastraAuthGoogle({
        clientId: appConfig.GOOGLE_CLIENT_ID,
        clientSecret: appConfig.GOOGLE_CLIENT_SECRET,
        redirectUri: appConfig.GOOGLE_REDIRECT_URI,
        session: appConfig.GOOGLE_COOKIE_PASSWORD
            ? { cookiePassword: appConfig.GOOGLE_COOKIE_PASSWORD }
            : undefined,
        public: [TELEGRAM_CHANNEL_WEBHOOK],
        // Autorizado = existir en la colección users (la identidad canónica es
        // el email). Segunda línea de defensa para /api/*: la primera es el
        // gate del callback SSO de abajo, que ni siquiera emite la cookie.
        authorizeUser: async user => {
            if (!user?.email || user.emailVerified === false) return false
            return (await userRepository.findByEmail(user.email)) !== null
        },
    })

    const sso = auth as unknown as { handleCallback?: SSOCallback }
    const originalHandleCallback = sso.handleCallback?.bind(auth)
    if (originalHandleCallback) {
        sso.handleCallback = async (code, state) => {
            const result = await originalHandleCallback(code, state)
            await assertInvitedAndSyncName(result.user)
            return result
        }
    } else {
        console.warn('[google-auth] SSO handleCallback not present; invite gate not applied to login')
    }

    return auth
}
