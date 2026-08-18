import { MastraJwtAuth } from '@mastra/auth'
import { appConfig } from '@config/app.config'
import { assertInvitedAndSyncName } from './invite-gate'
import { appLogger } from './app-logger'

// El webhook del canal Telegram vive bajo /api/* (protegido por default del
// middleware de auth) pero ya tiene su propia protección vía
// TELEGRAM_WEBHOOK_SECRET_TOKEN, así que debe quedar público o el bot muere.
export const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

// Identidad que emite el BFF de mostro-web: Google verifica el email allá y acá
// sólo confiamos en la firma del token. Que la firma sea válida no alcanza para
// entrar: authorizeUser exige que el email exista en users, así que el acceso
// sigue siendo por invitación aunque el BFF le dé sesión a cualquier cuenta.
export function createJwtAuth(): MastraJwtAuth | undefined {
    if (!appConfig.MOSTRO_JWT_SECRET) {
        appLogger.warn('[jwt-auth] MOSTRO_JWT_SECRET not set, BFF auth disabled')
        return undefined
    }

    return new MastraJwtAuth({
        secret: appConfig.MOSTRO_JWT_SECRET,
        public: [TELEGRAM_CHANNEL_WEBHOOK],
        authorizeUser: async user => {
            const email = typeof user?.email === 'string' ? user.email : undefined
            if (!email) return false
            try {
                await assertInvitedAndSyncName({ email, name: typeof user.name === 'string' ? user.name : undefined })
                return true
            } catch {
                return false
            }
        },
        // Misma resource id que Telegram (el email) para que un usuario vea la
        // misma memoria desde el bot y desde la web.
        mapUserToResourceId: user => (typeof user?.email === 'string' ? user.email : undefined),
    })
}
