import { getGmailClient } from '@lib/mailer/gmail-client'
import { GMAIL_TIMEOUT_MS, withGmailRetry } from '@lib/mailer/gmail-retry'
import { GmailMessage, type InboxMessage } from './gmail-message'

type GmailClient = ReturnType<typeof getGmailClient>
type LabelChange = { addLabelIds?: string[]; removeLabelIds?: string[] }

// Acceso a la casilla: buscar, leer y etiquetar. Funciones sueltas sobre el cliente
// compartido — no hay estado propio que justifique una clase. No saben qué labels
// significan qué ni en qué orden le sirven los mails al que llama: eso es política
// del poller (poll-mailbox.ts).
//
// El cliente se resuelve al llamar y no al importar: getGmailClient() necesita la
// configuración cargada. Los tests inyectan el suyo por el último parámetro.

// El contrato que el poller (poll-mailbox.ts) y el retry (retry-failed-mails.ts)
// necesitan de la casilla. Estructural a propósito: los tests lo satisfacen con un
// literal de tres funciones, sin castear.
export type InboxReader = {
    search: (query: string) => Promise<InboxMessage[]>
    addLabel: (id: string, label: string) => Promise<void>
    removeLabel: (id: string, label: string) => Promise<void>
}

export async function search(query: string, gmail: GmailClient = getGmailClient()): Promise<InboxMessage[]> {
    const { data } = await withGmailRetry(() =>
        gmail.users.messages.list({ userId: 'me', q: query }, { timeout: GMAIL_TIMEOUT_MS }))
    const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id))

    return Promise.all(ids.map(async id => {
        const { data: full } = await withGmailRetry(() =>
            gmail.users.messages.get({ userId: 'me', id, format: 'full' }, { timeout: GMAIL_TIMEOUT_MS }))
        return new GmailMessage(id, full).toInbox()
    }))
}

export async function addLabel(id: string, label: string, gmail: GmailClient = getGmailClient()): Promise<void> {
    await modify(gmail, id, { addLabelIds: [await labelId(gmail, label)] })
}

export async function removeLabel(id: string, label: string, gmail: GmailClient = getGmailClient()): Promise<void> {
    await modify(gmail, id, { removeLabelIds: [await labelId(gmail, label)] })
}

export const gmailReader: InboxReader = { search, addLabel, removeLabel }

// Con reintento: etiquetar es la escritura que persiste estado; un fallo transitorio
// no debe dejarla a medias.
async function modify(gmail: GmailClient, id: string, requestBody: LabelChange): Promise<void> {
    await withGmailRetry(() => gmail.users.messages.modify(
        { userId: 'me', id, requestBody },
        { timeout: GMAIL_TIMEOUT_MS },
    ))
}

// Resuelve el nombre del label a su id en cada llamada, sin cache: son un puñado de
// mails por ciclo y labels.list es barato.
async function labelId(gmail: GmailClient, name: string): Promise<string> {
    const { data } = await withGmailRetry(() =>
        gmail.users.labels.list({ userId: 'me' }, { timeout: GMAIL_TIMEOUT_MS }))
    const existing = data.labels?.find(label => label.name === name)
    if (existing?.id) {
        return existing.id
    }

    // Sin reintento: crear no es idempotente (un create que llegó pero cuya respuesta
    // se perdió fallaría el reintento con 409). Se crea una sola vez en la vida de
    // cada label; si falla, la próxima llamada lo encuentra o lo vuelve a intentar.
    const created = await gmail.users.labels.create({
        userId: 'me',
        requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    }, { timeout: GMAIL_TIMEOUT_MS })
    if (!created.data.id) {
        throw new Error(`Gmail creó el label "${name}" pero no devolvió su id`)
    }
    return created.data.id
}
