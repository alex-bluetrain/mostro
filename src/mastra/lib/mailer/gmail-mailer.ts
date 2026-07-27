import { appConfig } from '../../config/app.config'
import { buildRawMessage } from './mime'
import { getGmailClient } from './gmail-client'

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

function httpStatusOf(error: unknown): number | undefined {
    const candidate = error as { status?: number; response?: { status?: number } }
    return candidate?.response?.status ?? candidate?.status
}

// El refresh token se revocó, o la app OAuth quedó en modo Testing y el token murió a los 7 días.
function isInvalidGrant(error: unknown): boolean {
    const candidate = error as { message?: string; response?: { data?: { error?: string } } }
    return candidate?.response?.data?.error === 'invalid_grant'
        || (candidate?.message ?? '').includes('invalid_grant')
}

// Sin status HTTP = fallo de red o timeout, que sí conviene reintentar.
// Un 4xx no mejora esperando: token revocado, destinatario inválido, cuerpo mal armado.
function isRetryable(error: unknown): boolean {
    const status = httpStatusOf(error)
    if (status === undefined) return true
    if (status === 429) return true
    return status >= 500
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

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
    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            // gaxios no pone timeout si no se lo pedimos: sin esto, un cuelgue de red puede
            // tardar los ~300s por defecto de undici, multiplicado por los 3 intentos.
            await getGmailClient().users.messages.send({ userId: 'me', requestBody: { raw } }, { timeout: 15000 })
            return
        } catch (error) {
            lastError = error

            if (isInvalidGrant(error)) {
                throw new Error(
                    'El refresh token de Gmail ya no es válido: regeneralo con `pnpm run gmail:auth` '
                    + 'y verificá que la app OAuth esté publicada en producción.',
                )
            }

            if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break

            await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
        }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`No se pudo enviar el correo a ${to}: ${detail}`)
}
