import { auth, gmail } from '@googleapis/gmail'
import { appConfig } from '../../config/app.config'

let client: ReturnType<typeof gmail> | undefined

// Compartido entre el mailer (enviar) y el reader (leer y etiquetar): un solo
// refresh token, un solo cliente. El SDK renueva el access token solo.
export function getGmailClient() {
    if (!client) {
        const oauth2 = new auth.OAuth2(appConfig.GMAIL_MAILER_CLIENT_ID, appConfig.GMAIL_MAILER_CLIENT_SECRET)
        oauth2.setCredentials({ refresh_token: appConfig.GMAIL_MAILER_REFRESH_TOKEN })
        client = gmail({ version: 'v1', auth: oauth2 })
    }
    return client
}
