import { getGmailClient } from '@lib/mailer/gmail-client'
import { GMAIL_TIMEOUT_MS, withGmailRetry } from '@lib/mailer/gmail-retry'

export type InboxMessage = {
    id: string
    from: string
    subject: string
    body: string
    receivedAt: Date
    // Solo los headers del nodo raíz (los del mail: From, Subject, Message-ID...);
    // los de las parts internas son metadata de encoding sin interés. Misma forma
    // array-de-pares que la API (los headers pueden repetirse y el orden importa),
    // pero sin los nulls del codegen de Google: Gmail siempre manda name y value.
    // Sin consumidores todavía: se expone para habilitar filtros futuros por header
    // (por ejemplo, atar un mail a su run vía Message-ID / In-Reply-To).
    headers: Array<{ name: string; value: string }>
}

export type GmailReader = {
    search(query: string): Promise<InboxMessage[]>
    addLabel(id: string, label: string): Promise<void>
    removeLabel(id: string, label: string): Promise<void>
}

type GmailClient = ReturnType<typeof getGmailClient>
type Payload = {
    headers?: Array<{ name?: string | null; value?: string | null }>
    mimeType?: string | null
    body?: { data?: string | null } | null
    parts?: Payload[]
}

function headerOf(payload: Payload | undefined, name: string): string {
    const header = payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())
    return header?.value ?? ''
}

function headersOf(payload: Payload | undefined): Array<{ name: string; value: string }> {
    // name sí requiere contenido (un header sin nombre no sirve), pero value tolera
    // string vacío: un `Subject:` vacío es un header legítimo y no debe perderse.
    return (payload?.headers ?? []).flatMap(h => (h.name && h.value != null ? [{ name: h.name, value: h.value }] : []))
}

// "Farmacia <pedidos@farmacia.test>" -> "pedidos@farmacia.test". Sin display name
// el header ya viene limpio.
function emailOf(from: string): string {
    const match = from.match(/<([^>]+)>/)
    return (match ? match[1] : from).trim().toLowerCase()
}

function decode(data: string | null | undefined): string {
    return data ? Buffer.from(data, 'base64url').toString('utf-8') : ''
}

// Busca una parte text/plain a cualquier profundidad en el árbol de payloads.
// Devuelve null si no la encuentra, para distinguir entre "encontré el tipo preferido"
// y "encontré algún fallback".
function findPlainText(payload: Payload | undefined): string | null {
    if (!payload) return null
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return decode(payload.body.data)
    }
    for (const part of payload.parts ?? []) {
        const found = findPlainText(part)
        if (found !== null) return found
    }
    return null
}

// Un mail puede traer el texto directo o repartido en parts (multipart/alternative
// con html + plano). Nos interesa el plano; si no hay, el primer body con datos.
// Primero busca text/plain a cualquier profundidad. Si no lo encuentra, cae al
// primer body con contenido. Esto distingue explícitamente entre "preferido" y "fallback".
function bodyOf(payload: Payload | undefined): string {
    if (!payload) return ''

    // Primera pasada: buscar específicamente text/plain a cualquier profundidad
    const plainText = findPlainText(payload)
    if (plainText !== null) return plainText

    // Segunda pasada: fallback a cualquier body con contenido
    if (payload.parts) {
        for (const part of payload.parts) {
            const found = bodyOf(part)
            if (found) return found
        }
    }

    return decode(payload.body?.data)
}

export function createGmailReader(client?: GmailClient): GmailReader {
    const gmailFor = () => client ?? getGmailClient()
    const labelPromises = new Map<string, Promise<string>>()

    async function labelIdFor(name: string): Promise<string> {
        // Memoiza la promesa en vuelo para evitar crear labels duplicados
        // en llamadas concurrentes para el mismo label inexistente.
        const cached = labelPromises.get(name)
        if (cached) return cached

        const promise = (async () => {
            const gmail = gmailFor()
            const { data } = await gmail.users.labels.list({ userId: 'me' }, { timeout: GMAIL_TIMEOUT_MS })
            const existing = data.labels?.find(label => label.name === name)
            if (existing?.id) {
                return existing.id
            }

            const created = await gmail.users.labels.create({
                userId: 'me',
                requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
            }, { timeout: GMAIL_TIMEOUT_MS })
            return created.data.id as string
        })().catch(error => {
            // Si la promesa rechaza, sácala del cache para que el siguiente intento reintente.
            labelPromises.delete(name)
            throw error
        })

        // Guardá la promesa en el cache sincronamente, antes de cualquier await,
        // para que llamadas concurrentes vean la misma promesa en vuelo.
        labelPromises.set(name, promise)
        return promise
    }

    return {
        async search(query) {
            const gmail = gmailFor()
            const { data } = await withGmailRetry(() =>
                gmail.users.messages.list({ userId: 'me', q: query }, { timeout: GMAIL_TIMEOUT_MS }))
            const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id))

            const messages = await Promise.all(ids.map(async id => {
                const { data: full } = await withGmailRetry(() =>
                    gmail.users.messages.get({ userId: 'me', id, format: 'full' }, { timeout: GMAIL_TIMEOUT_MS }))
                const payload = full.payload as Payload | undefined
                return {
                    id,
                    from: emailOf(headerOf(payload, 'From')),
                    subject: headerOf(payload, 'Subject'),
                    body: bodyOf(payload),
                    receivedAt: new Date(Number(full.internalDate ?? 0)),
                    headers: headersOf(payload),
                }
            }))

            return messages
        },

        async addLabel(id, label) {
            const labelId = await labelIdFor(label)
            // Con reintento: etiquetar es la escritura que persiste estado; un fallo
            // transitorio no debe dejarla a medias.
            await withGmailRetry(() => gmailFor().users.messages.modify({
                userId: 'me',
                id,
                requestBody: { addLabelIds: [labelId] },
            }, { timeout: GMAIL_TIMEOUT_MS }))
        },

        async removeLabel(id, label) {
            const labelId = await labelIdFor(label)
            await withGmailRetry(() => gmailFor().users.messages.modify({
                userId: 'me',
                id,
                requestBody: { removeLabelIds: [labelId] },
            }, { timeout: GMAIL_TIMEOUT_MS }))
        },
    }
}

export const gmailReader = createGmailReader()
