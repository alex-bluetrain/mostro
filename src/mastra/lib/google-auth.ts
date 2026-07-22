import { MastraAuthGoogle } from '@mastra/auth-google'
import { appConfig } from '../config/app.config'

// El webhook del canal Telegram vive bajo /api/* (protegido por default del
// middleware de auth) pero ya tiene su propia protección vía
// TELEGRAM_WEBHOOK_SECRET_TOKEN, así que debe quedar público o el bot muere
const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

export function parseAllowedEmails(raw: string | undefined): string[] {
    if (!raw) return []
    return raw
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(email => email.length > 0)
}

export function createGoogleAuth(): MastraAuthGoogle | undefined {
    if (!appConfig.GOOGLE_CLIENT_ID || !appConfig.GOOGLE_CLIENT_SECRET) {
        console.warn('[google-auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set, server auth disabled')
        return undefined
    }

    const allowedEmails = parseAllowedEmails(appConfig.GOOGLE_ALLOWED_EMAILS)
    if (allowedEmails.length === 0) {
        console.warn('[google-auth] GOOGLE_ALLOWED_EMAILS empty: no one will be authorized until it is set')
    }

    return new MastraAuthGoogle({
        clientId: appConfig.GOOGLE_CLIENT_ID,
        clientSecret: appConfig.GOOGLE_CLIENT_SECRET,
        redirectUri: appConfig.GOOGLE_REDIRECT_URI,
        session: appConfig.GOOGLE_COOKIE_PASSWORD
            ? { cookiePassword: appConfig.GOOGLE_COOKIE_PASSWORD }
            : undefined,
        public: [TELEGRAM_CHANNEL_WEBHOOK],
        // Las cuentas Gmail personales no traen claim hd (solo Workspace), así
        // que la autorización va por allowlist de emails y no por allowedDomains
        authorizeUser: user => {
            if (!user?.email || user.emailVerified === false) return false
            return allowedEmails.includes(user.email.toLowerCase())
        },
    })
}
