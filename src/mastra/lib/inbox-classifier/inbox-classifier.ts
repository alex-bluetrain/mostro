import { auth, gmail } from '@googleapis/gmail'
import type { Mastra } from '@mastra/core/mastra'
import { z } from 'zod'
import { appConfig } from '@config/app.config'
import { stripMailBody } from './strip-mail-body'

export type GmailClient = ReturnType<typeof gmail>

export type ClassifierOutcome = {
    label: string
    description: string
}

export type InboxClassifierConfig = {
    queryDescription: string
    outcomes: ClassifierOutcome[]
}

export class InboxClassifier {
    private query: string | undefined
    private readonly gmail: GmailClient

    constructor(
        private readonly mastra: Mastra,
        private readonly config: InboxClassifierConfig,
        gmailClientOverride?: GmailClient,
    ) {
        if (gmailClientOverride) {
            this.gmail = gmailClientOverride
        } else {
            const oauth2 = new auth.OAuth2(appConfig.GMAIL_MAILER_CLIENT_ID, appConfig.GMAIL_MAILER_CLIENT_SECRET)
            oauth2.setCredentials({ refresh_token: appConfig.GMAIL_MAILER_REFRESH_TOKEN })
            this.gmail = gmail({ version: 'v1', auth: oauth2 })
        }
    }

    async init(): Promise<void> {
        this.query = await translateQuery(this.mastra, this.config.queryDescription)
        console.info(`[inbox-classifier] query traducida: ${this.query}`)
    }

    async run(): Promise<void> {
        if (this.query === undefined) throw new Error('InboxClassifier: llamá a init() antes de run()')

        const { data } = await this.gmail.users.messages.list({ userId: 'me', q: this.query })
        // Gmail's messages.list devuelve de más nuevo a más viejo y no tiene parámetro de orden
        // ascendente, así que invertir alcanza para procesar de más viejo a más nuevo sin ordenar por fecha.
        const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id)).reverse()

        for (const id of ids) {
            try {
                const { data: raw } = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' })
                const text = stripMailBody(raw.payload)
                const label = await classify(this.mastra, text, this.config.outcomes)
                await this.applyLabel(id, label)
            } catch (error) {
                console.warn(`[inbox-classifier] no pude clasificar/etiquetar ${id}`, error)
                // TODO: notificar el fallo (placeholder para etapa futura)
            }
        }
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

    private async applyLabel(messageId: string, label: string): Promise<void> {
        const labelId = await this.resolveLabelId(label)
        await this.gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: { addLabelIds: [labelId] },
        })
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

async function classify(mastra: Mastra, text: string, outcomes: ClassifierOutcome[]): Promise<string> {
    const agent = mastra.getAgent('inboxClassifier')
    const labels = outcomes.map(o => o.label) as [string, ...string[]]
    const schema = z.object({ label: z.enum(labels) })
    const prompt = `Clasificá este mail contra los siguientes resultados posibles. Elegí exactamente uno.

${outcomes.map(o => `- ${o.label}: ${o.description}`).join('\n')}

Mail:
${text}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).label
}
