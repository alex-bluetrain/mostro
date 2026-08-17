import type { gmail } from '@googleapis/gmail'
import type { Mastra } from '@mastra/core/mastra'
import { z } from 'zod'
import { getGmailClient } from '@lib/mailer/gmail-client'
import { stripMailBody } from './strip-mail-body'
import { resolveMailDate } from './resolve-mail-date'

export type GmailClient = ReturnType<typeof gmail>

// Labels de estado del procesamiento, ortogonales al label de clasificación. Un mail con
// cualquiera de estos tres ya fue procesado y la query de fetch lo excluye.
export const OUTCOME_COMPLETED = 'outcome.completed'
export const OUTCOME_FAILED = 'outcome.failed'
export const OUTCOME_REVIEW = 'outcome.review'

export type InboxManagerConfig = {
    queryDescription: string
}

export type FetchedMail = {
    id: string
    text: string
    year: number
    month: number
}

// Único módulo que habla con Gmail: lee mails y aplica labels. No clasifica ni ejecuta
// side effects — eso es de mail-classifier y outcome-processor.
export class InboxManager {
    initialized = false
    private query!: string
    private readonly gmail: GmailClient

    constructor(
        private readonly config: InboxManagerConfig,
        gmailClientOverride?: GmailClient,
    ) {
        this.gmail = gmailClientOverride ?? getGmailClient()
    }

    // Idempotente: la instancia puede declararse a nivel de módulo (donde `mastra` todavía
    // no existe) y llamarse init(mastra) en cada ejecución; solo la primera hace trabajo.
    async init(mastra: Mastra): Promise<void> {
        if (this.initialized) return
        const translated = await translateQuery(mastra, this.config.queryDescription)
        // Las exclusiones son estáticas: mail sin label de estado = no procesado. No
        // dependen de las reglas de clasificación, así que no hay que derivarlas de Mongo.
        const exclusions = [OUTCOME_COMPLETED, OUTCOME_FAILED, OUTCOME_REVIEW].map(label => `-label:${label}`)
        this.query = [translated, ...exclusions].join(' ')
        this.initialized = true
        mastra.getLogger().info(`[inbox-manager] query traducida: ${this.query}`)
    }

    async fetch(): Promise<FetchedMail[]> {
        if (!this.initialized) throw new Error('InboxManager: llamá a init() antes de fetch()')

        const { data } = await this.gmail.users.messages.list({ userId: 'me', q: this.query })
        // Gmail's messages.list devuelve de más nuevo a más viejo y no tiene parámetro de orden
        // ascendente, así que invertir alcanza para procesar de más viejo a más nuevo sin ordenar por fecha.
        const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id)).reverse()

        const mails: FetchedMail[] = []
        for (const id of ids) {
            const { data: raw } = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' })
            const text = stripMailBody(raw.payload)
            const internalDate = raw.internalDate ? new Date(Number(raw.internalDate)) : new Date()
            const sentAt = resolveMailDate(raw.payload?.headers ?? undefined, internalDate)
            mails.push({ id, text, year: sentAt.getFullYear(), month: sentAt.getMonth() + 1 })
        }
        return mails
    }

    async applyLabel(messageId: string, label: string): Promise<void> {
        const labelId = await this.resolveLabelId(label)
        await this.gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: { addLabelIds: [labelId] },
        })
    }

    private async resolveLabelId(label: string): Promise<string> {
        const { data } = await this.gmail.users.labels.list({ userId: 'me' })
        const existing = data.labels?.find(l => l.name === label)
        if (existing?.id) return existing.id

        const created = await this.gmail.users.labels.create({
            userId: 'me',
            requestBody: { name: label, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        if (!created.data.id) throw new Error(`Gmail no devolvió id para el label "${label}"`)
        return created.data.id
    }
}

async function translateQuery(mastra: Mastra, queryDescription: string): Promise<string> {
    const agent = mastra.getAgent('inboxClassifier')
    const schema = z.object({ query: z.string().min(1) })
    const prompt = `Convertí esta descripción a una query de búsqueda de Gmail (sintaxis de users.messages.list: from:, newer_than:, label:, -label:, etc.).

Descripción: ${queryDescription}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).query
}
