import { MastraAuthGoogle } from '@mastra/auth-google'
import { appConfig } from '../config/app.config'
import { getUserByEmail } from './users'

// El webhook del canal Telegram vive bajo /api/* (protegido por default del
// middleware de auth) pero ya tiene su propia protección vía
// TELEGRAM_WEBHOOK_SECRET_TOKEN, así que debe quedar público o el bot muere
const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

export function createGoogleAuth(): MastraAuthGoogle | undefined {
    if (!appConfig.GOOGLE_CLIENT_ID || !appConfig.GOOGLE_CLIENT_SECRET) {
        console.warn('[google-auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set, server auth disabled')
        return undefined
    }

    return new MastraAuthGoogle({
        clientId: appConfig.GOOGLE_CLIENT_ID,
        clientSecret: appConfig.GOOGLE_CLIENT_SECRET,
        redirectUri: appConfig.GOOGLE_REDIRECT_URI,
        session: appConfig.GOOGLE_COOKIE_PASSWORD
            ? { cookiePassword: appConfig.GOOGLE_COOKIE_PASSWORD }
            : undefined,
        public: [TELEGRAM_CHANNEL_WEBHOOK],
        // Autorizado = existir en la colección users (la identidad canónica es
        // el email): invitar a alguien le da acceso al bot Y a la web de una
        authorizeUser: async user => {
            if (!user?.email || user.emailVerified === false) return false
            return (await getUserByEmail(user.email)) !== null
        },
    })
}
