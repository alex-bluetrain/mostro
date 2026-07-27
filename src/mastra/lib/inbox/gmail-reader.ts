import { getGmailClient } from '../mailer/gmail-client'

export const PROCESSED_LABEL = 'mostro-processed'
export const FAILED_LABEL = 'mostro-failed'

export type InboxMessage = {
    id: string
    from: string
    subject: string
    body: string
    receivedAt: Date
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

// "Farmacia <pedidos@farmacia.test>" -> "pedidos@farmacia.test". Sin display name
// el header ya viene limpio.
function emailOf(from: string): string {
    const match = from.match(/<([^>]+)>/)
    return (match ? match[1] : from).trim().toLowerCase()
}

function decode(data: string | null | undefined): string {
    return data ? Buffer.from(data, 'base64url').toString('utf-8') : ''
}

// Un mail puede traer el texto directo o repartido en parts (multipart/alternative
// con html + plano). Nos interesa el plano; si no hay, el primer body con datos.
function bodyOf(payload: Payload | undefined): string {
    if (!payload) return ''
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return decode(payload.body.data)
    }

    // For multipart, prioritize text/plain
    if (payload.parts) {
        const plainTextPart = payload.parts.find(part => part.mimeType === 'text/plain')
        if (plainTextPart) {
            return bodyOf(plainTextPart)
        }
        // If no plain text, use first part with content
        for (const part of payload.parts) {
            const found = bodyOf(part)
            if (found) return found
        }
    }

    return decode(payload.body?.data)
}

export function createGmailReader(client?: GmailClient): GmailReader {
    const gmailFor = () => client ?? getGmailClient()
    const labelIds = new Map<string, string>()

    async function labelIdFor(name: string): Promise<string> {
        const cached = labelIds.get(name)
        if (cached) return cached

        const gmail = gmailFor()
        const { data } = await gmail.users.labels.list({ userId: 'me' })
        const existing = data.labels?.find(label => label.name === name)
        if (existing?.id) {
            labelIds.set(name, existing.id)
            return existing.id
        }

        const created = await gmail.users.labels.create({
            userId: 'me',
            requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        const id = created.data.id as string
        labelIds.set(name, id)
        return id
    }

    return {
        async search(query) {
            const gmail = gmailFor()
            const { data } = await gmail.users.messages.list({ userId: 'me', q: query })
            const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id))

            const messages = await Promise.all(ids.map(async id => {
                const { data: full } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
                const payload = full.payload as Payload | undefined
                return {
                    id,
                    from: emailOf(headerOf(payload, 'From')),
                    subject: headerOf(payload, 'Subject'),
                    body: bodyOf(payload),
                    receivedAt: new Date(Number(full.internalDate ?? 0)),
                }
            }))

            // Del más viejo al más nuevo: un acuse anterior tiene que procesarse antes
            // que la confirmación que lo sigue, o el segundo mail se evalúa contra un
            // step que todavía no avanzó.
            return messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
        },

        async addLabel(id, label) {
            const labelId = await labelIdFor(label)
            await gmailFor().users.messages.modify({
                userId: 'me',
                id,
                requestBody: { addLabelIds: [labelId] },
            })
        },

        async removeLabel(id, label) {
            const labelId = await labelIdFor(label)
            await gmailFor().users.messages.modify({
                userId: 'me',
                id,
                requestBody: { removeLabelIds: [labelId] },
            })
        },
    }
}

export const gmailReader = createGmailReader()
