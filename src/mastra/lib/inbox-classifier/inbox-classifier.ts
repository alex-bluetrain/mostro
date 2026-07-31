import type { gmail } from '@googleapis/gmail'
import type { Mastra } from '@mastra/core/mastra'
import { z } from 'zod'
import { getGmailClient } from '@lib/mailer/gmail-client'
import { stripMailBody } from './strip-mail-body'
import { resolveMailYearMonth } from './resolve-mail-year-month'

export type GmailClient = ReturnType<typeof gmail>

// Etiqueta terminal para un mail que matcheó la query pero no se pudo procesar: no había
// run abierto, la extracción no validó, o el workflow rechazó la reanudación.
export const FAILED_LABEL = 'mostro/failed'

export type HandleContext = {
    mastra: Mastra
    text: string
    yearMonth: string
    data: unknown
}

export type HandleResult = { ok: true } | { ok: false; reason: string }

// Adapta el {ok, reason?} que devuelven los helpers *-run.ts al HandleResult que espera el
// classifier, descartando campos internos (status, suspendedStep, etc) que no le importan acá.
export function toHandleResult(result: { ok: boolean; reason?: string }): HandleResult {
    return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'unknown' }
}

export type ClassifierOutcome = {
    label: string
    // Cómo decide el LLM si el mail corresponde a este outcome.
    classification: { description: string }
    // Presente solo si hay datos que extraer del mail. `instructions` guía la extracción
    // (separada de la descripción de clasificación para no confundir al modelo) y el schema
    // valida la extracción antes de que llegue a handle().
    extraction?: { instructions: string; schema: z.ZodType }
    // Ausente en el catch-all: ahí no hay nada que hacer más que etiquetar. Presente en
    // los outcomes que tienen que tocar un workflow.
    handle?: (ctx: HandleContext) => Promise<HandleResult>
}

export type InboxClassifierConfig = {
    queryDescription: string
    outcomes: ClassifierOutcome[]
}

export class InboxClassifier {
    initialized = false
    private mastra!: Mastra
    private query!: string
    private readonly gmail: GmailClient

    constructor(
        private readonly config: InboxClassifierConfig,
        gmailClientOverride?: GmailClient,
    ) {
        this.gmail = gmailClientOverride ?? getGmailClient()
    }

    // Idempotente: la instancia puede declararse a nivel de módulo (donde `mastra` todavía
    // no existe) y llamarse init(mastra) en cada ejecución; solo la primera hace trabajo.
    async init(mastra: Mastra): Promise<void> {
        if (this.initialized) return
        this.mastra = mastra
        const translated = await translateQuery(mastra, this.config.queryDescription)
        // La idempotencia no puede depender de que el modelo se acuerde de excluir las
        // etiquetas ya aplicadas: eso lo agrega el código, una vez, después de traducir.
        const exclusions = [...this.config.outcomes.map(o => `-label:${o.label}`), `-label:${FAILED_LABEL}`]
        this.query = [translated, ...exclusions].join(' ')
        this.initialized = true
        console.info(`[inbox-classifier] query traducida: ${this.query}`)
    }

    async run(): Promise<void> {
        if (!this.initialized) throw new Error('InboxClassifier: llamá a init() antes de run()')

        const { data } = await this.gmail.users.messages.list({ userId: 'me', q: this.query })
        // Gmail's messages.list devuelve de más nuevo a más viejo y no tiene parámetro de orden
        // ascendente, así que invertir alcanza para procesar de más viejo a más nuevo sin ordenar por fecha.
        const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id)).reverse()

        for (const id of ids) {
            try {
                await this.processMessage(id)
            } catch (error) {
                console.error(`[inbox-classifier] no pude procesar ${id}`, error)
                await this.tryApplyLabel(id, FAILED_LABEL)
            }
        }
    }

    private async processMessage(id: string): Promise<void> {
        const { data: raw } = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' })
        const text = stripMailBody(raw.payload)
        const internalDate = raw.internalDate ? new Date(Number(raw.internalDate)) : new Date()
        const yearMonth = resolveMailYearMonth(raw.payload?.headers ?? undefined, internalDate)

        const outcomeLabel = await classify(this.mastra, text, this.config.outcomes)
        const outcome = this.config.outcomes.find(o => o.label === outcomeLabel)
        if (!outcome) throw new Error(`clasificación devolvió un label desconocido: ${outcomeLabel}`)

        const data = outcome.extraction ? await extract(this.mastra, text, outcome.extraction) : undefined

        if (outcome.handle) {
            const result = await outcome.handle({ mastra: this.mastra, text, yearMonth, data })
            if (!result.ok) {
                console.error(`[inbox-classifier] ${id} clasificado como "${outcome.label}" pero el handler falló: ${result.reason}`)
                await this.applyLabel(id, FAILED_LABEL)
                return
            }
        }

        await this.applyLabel(id, outcome.label)
    }

    private async tryApplyLabel(id: string, label: string): Promise<void> {
        try {
            await this.applyLabel(id, label)
        } catch (error) {
            console.error(`[inbox-classifier] no pude etiquetar ${id} como "${label}"`, error)
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

${outcomes.map(o => `- ${o.label}: ${o.classification.description}`).join('\n')}

Mail:
${text}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).label
}

async function extract(
    mastra: Mastra,
    text: string,
    extraction: { instructions: string; schema: z.ZodType },
): Promise<unknown> {
    const agent = mastra.getAgent('inboxClassifier')
    const { schema } = extraction
    const prompt = `${extraction.instructions}

Si no podés completar un campo con confianza, no inventes un valor.

Mail:
${text}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object)
}
