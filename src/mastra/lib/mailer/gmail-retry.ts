// Criterio de reintento y timeout compartido entre el mailer (gmail-mailer.ts) y el
// InboxManager (../inbox-manager/inbox-manager.ts): los dos hablan con la misma
// API de Gmail sobre el mismo cliente compartido (./gmail-client.ts) y tienen que tratar
// los mismos errores transitorios de la misma forma. No duplicar este criterio ahi.

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

// gaxios no pone timeout si no se lo pedimos: sin esto, un cuelgue de red puede tardar
// los ~300s por defecto de undici. Pasalo como segundo argumento de cada llamada al
// cliente de Gmail: gmail.users.messages.list({...}, { timeout: GMAIL_TIMEOUT_MS }).
export const GMAIL_TIMEOUT_MS = 15000

function httpStatusOf(error: unknown): number | undefined {
    const candidate = error as { status?: number; response?: { status?: number } }
    return candidate?.response?.status ?? candidate?.status
}

// El refresh token se revocó, o la app OAuth quedó en modo Testing y el token murió a los 7 días.
export function isInvalidGrant(error: unknown): boolean {
    const candidate = error as { message?: string; response?: { data?: { error?: string } } }
    return candidate?.response?.data?.error === 'invalid_grant'
        || (candidate?.message ?? '').includes('invalid_grant')
}

// Sin status HTTP = fallo de red o timeout, que sí conviene reintentar.
// Un 4xx no mejora esperando: token revocado, destinatario inválido, cuerpo mal armado.
export function isRetryable(error: unknown): boolean {
    const status = httpStatusOf(error)
    if (status === undefined) return true
    if (status === 429) return true
    return status >= 500
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Reintenta con backoff exponencial los errores transitorios (red, 429, 5xx). Un
// invalid_grant o cualquier otro error no retriable se propaga en el primer intento;
// cada llamador decide cómo explicarlo (el mailer, por ejemplo, lo traduce a un mensaje
// que apunta a `pnpm run gmail:auth`).
export async function withGmailRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await operation()
        } catch (error) {
            lastError = error

            if (isInvalidGrant(error) || !isRetryable(error) || attempt === MAX_ATTEMPTS) {
                throw error
            }

            await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
        }
    }

    // Inalcanzable: el loop siempre retorna o lanza en la última iteración. Está acá
    // solo para que TypeScript vea una salida en todos los caminos.
    throw lastError
}
