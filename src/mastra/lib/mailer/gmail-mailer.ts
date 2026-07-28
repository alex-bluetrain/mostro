import { appConfig } from '@config/app.config'
import { buildRawMessage } from './mime'
import { getGmailClient } from './gmail-client'
import { GMAIL_TIMEOUT_MS, isInvalidGrant, withGmailRetry } from './gmail-retry'

export async function sendEmail({
    to,
    subject,
    text,
}: {
    to: string
    subject: string
    text: string
}): Promise<void> {
    const raw = buildRawMessage({ from: appConfig.GMAIL_MAILER_SENDER, to, subject, text })

    try {
        await withGmailRetry(() =>
            getGmailClient().users.messages.send({ userId: 'me', requestBody: { raw } }, { timeout: GMAIL_TIMEOUT_MS }),
        )
    } catch (error) {
        if (isInvalidGrant(error)) {
            throw new Error(
                'El refresh token de Gmail ya no es válido: regeneralo con `pnpm run gmail:auth` '
                + 'y verificá que la app OAuth esté publicada en producción.',
            )
        }

        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`No se pudo enviar el correo a ${to}: ${detail}`)
    }
}
