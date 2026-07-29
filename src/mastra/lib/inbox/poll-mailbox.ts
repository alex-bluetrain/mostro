import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { z } from 'zod'
import { previousYearMonth, yearMonthOf } from '@lib/date-scope'
import { gmailReader, type GmailReader, type InboxMessage } from './gmail-reader'
import { extractFromMail, type Extract } from './mail-extractor'

// El protocolo de estado del poller sobre la casilla: qué mails ya se procesaron y
// cuáles fallaron. Son política de esta capa, no del reader — el reader pone y saca
// cualquier label que le pidan.
export const PROCESSED_LABEL = 'mostro-processed'
export const FAILED_LABEL = 'mostro-failed'

// La ventana que mira cada ciclo. Vive acá y no incrustada en cada query para que el
// reintento (retry-failed-mails.ts) no pueda quedar desalineado: un mail que se
// destraba fuera de esta ventana no lo levantaría nadie.
export const SEARCH_WINDOW = 'newer_than:30d'

export type ResumeResult = { ok: boolean; reason?: string }

export type StepConfig = {
    schema: z.ZodType
    description: string
    resume: (mastra: unknown, data: Record<string, unknown>, yearMonth: string) => Promise<ResumeResult>
}

export type PollFailure = { from: string; subject: string; reason: string }

export type PollConfig = {
    // Identidad del consumidor para los logs. String libre: este motor no conoce
    // los dominios de negocio.
    domain: string
    // Filtro grueso, server-side (query de Gmail): acota lo que se baja de la casilla.
    // Es eficiencia, no semántica — el que decide es matches.
    query?: string
    // Filtro fino, client-side: decide si el mail le incumbe a ESTE consumidor. Un
    // mail que no matchea se saltea sin etiquetar: puede ser de otro consumidor, y
    // el que no es de nadie se descarta solo al salir de SEARCH_WINDOW.
    matches: (message: InboxMessage) => boolean
    // Cómo avisar un fallo de procesamiento. Inyectado: este motor no sabe de
    // suscriptores ni de Telegram.
    onFailure: (mastra: unknown, failure: PollFailure) => Promise<unknown>
    workflowId: string
    getRunId: (yearMonth: string) => string
    steps: Record<string, StepConfig>
}

export type PollDeps = {
    // El orden de lo que devuelve search() no importa: runPollCycle ordena la tanda
    // por receivedAt antes de iterarla.
    reader: GmailReader
    extract: Extract
    readSuspendedStep: (mastra: unknown, workflowId: string, runId: string) => Promise<string | null>
}

type WorkflowLike = { getWorkflowRunById: (runId: string) => Promise<unknown> }
type MastraLike = { getWorkflow: (id: string) => WorkflowLike | undefined }

// getWorkflow lanza MastraError si el id no está registrado, no devuelve undefined
// (node_modules/@mastra/core/dist/chunk-PQ5PN4TW.js, getWorkflow). Tratamos "no
// registrado" como "no hay run abierto": el mail cae a mostro-failed con motivo, en vez
// de tumbar el ciclo entero y dejar los mails siguientes sin procesar.
export async function readSuspendedStep(
    mastra: unknown,
    workflowId: string,
    runId: string,
): Promise<string | null> {
    let run: unknown
    try {
        const workflow = (mastra as MastraLike | undefined)?.getWorkflow(workflowId)
        run = await workflow?.getWorkflowRunById(runId)
    } catch {
        return null
    }
    if (!run) return null

    const reader = createWorkflowStateReader(run as never)
    if (reader.getStatus() !== 'suspended') return null

    return reader.getSuspendedStep()?.stepId ?? null
}

const defaultDeps: PollDeps = {
    reader: gmailReader,
    extract: extractFromMail,
    readSuspendedStep,
}

// El mail de respuesta no siempre cae en el mes del pedido: uno abierto el 30 de julio se
// puede confirmar el 2 de agosto. Se prueba el mes del mail y después el anterior.
async function resolveOpenRun(
    mastra: unknown,
    config: PollConfig,
    deps: PollDeps,
    message: InboxMessage,
): Promise<{ yearMonth: string; stepId: string } | null> {
    const candidates = [yearMonthOf(message.receivedAt)]
    candidates.push(previousYearMonth(candidates[0]))

    for (const yearMonth of candidates) {
        const stepId = await deps.readSuspendedStep(mastra, config.workflowId, config.getRunId(yearMonth))
        if (stepId) return { yearMonth, stepId }
    }
    return null
}

export async function runPollCycle(
    mastra: unknown,
    config: PollConfig,
    deps: Partial<PollDeps> = {},
): Promise<{ processed: number; failed: number }> {
    const resolved: PollDeps = { ...defaultDeps, ...deps }
    const query = [config.query, `-label:${PROCESSED_LABEL}`, `-label:${FAILED_LABEL}`, SEARCH_WINDOW]
        .filter(Boolean)
        .join(' ')
    // Del más viejo al más nuevo: un acuse tiene que procesarse antes que la
    // confirmación que lo sigue, o el segundo mail se evalúa contra un step que todavía
    // no avanzó. El orden es un invariante de ESTE motor, no del reader: Gmail lista
    // del más nuevo al más viejo y un reader alternativo no tiene por qué saberlo.
    const found = await resolved.reader.search(query)
    const messages = [...found].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())

    let processed = 0
    let failed = 0

    // Etiquetar y avisar son I/O que puede fallar. Si cualquiera de las dos propaga,
    // los mails que faltan de la tanda quedan sin procesar — peor que no avisar de uno.
    const fail = async (message: InboxMessage, reason: string) => {
        failed++
        try {
            await resolved.reader.addLabel(message.id, FAILED_LABEL)
        } catch (error) {
            console.error(`[poll-${config.domain}] no pude etiquetar ${message.id} como fallido`, error)
        }
        try {
            await config.onFailure(mastra, {
                from: message.from,
                subject: message.subject,
                reason,
            })
        } catch (error) {
            console.error(`[poll-${config.domain}] no pude avisar del fallo de ${message.id}`, error)
        }
    }

    for (const message of messages) {
        // "No es mío" no es un fallo: otro consumidor puede reclamarlo en su ciclo.
        if (!config.matches(message)) {
            console.debug(`[poll-${config.domain}] descarte esperado: ${message.id} de ${message.from} no matchea el filtro de este dominio`)
            continue
        }

        // Por mail y no una vez por ciclo: si el primero avanza el run a la etapa
        // siguiente, el segundo tiene que evaluarse contra el step nuevo.
        const open = await resolveOpenRun(mastra, config, resolved, message)
        if (!open) {
            await fail(message, 'no hay ningún pedido abierto esperando una respuesta para este mes ni el anterior')
            continue
        }

        const step = config.steps[open.stepId]
        if (!step) {
            await fail(message, `el pedido está en el paso "${open.stepId}", que no espera mails`)
            continue
        }

        // extractFromMail dice no lanzar nunca, pero arma el schema del wrapper fuera
        // de su propio try/catch (mail-extractor.ts:52-56): un StepConfig.schema que no
        // sea un Zod real hace que .optional() lance sincrónicamente y, al ser async,
        // eso rechaza la promesa. Cubrimos esa fuga acá para no perder el resto de la tanda.
        let extraction: Awaited<ReturnType<Extract>>
        try {
            extraction = await resolved.extract(mastra, {
                subject: message.subject,
                body: message.body,
                description: step.description,
                schema: step.schema,
            })
        } catch (error) {
            await fail(message, `falló la extracción: ${error instanceof Error ? error.message : String(error)}`)
            continue
        }

        if (!extraction.matches) {
            await fail(message, extraction.reason)
            continue
        }

        try {
            const result = await step.resume(mastra, extraction.data ?? {}, open.yearMonth)
            if (!result.ok) {
                await fail(message, `el workflow rechazó la reanudación: ${result.reason ?? 'sin motivo'}`)
                continue
            }
        } catch (error) {
            await fail(message, error instanceof Error ? error.message : String(error))
            continue
        }

        // El workflow ya se reanudó: el trabajo está hecho aunque la etiqueta no salga.
        // Pero dejar el mail en la cola sin etiquetar solo es inofensivo si el consumidor
        // no tiene más wait steps por delante: ahí el run ya no está suspendido y el mail
        // cae a mostro-failed con motivo, visible, el próximo ciclo. Si el consumidor tiene
        // más de un step que espera mails, en cambio, el run se vuelve a suspender en la
        // etapa siguiente, así que el mail sin etiquetar reingresa a la cola y se evalúa
        // contra ESE step nuevo — que puede aceptarlo con datos que no le corresponden y
        // avanzar el run con información equivocada. Por eso, si falla el etiquetado de
        // procesado, ponemos el mail en cuarentena con FAILED_LABEL en vez de dejarlo
        // reingresar a la cola.
        try {
            await resolved.reader.addLabel(message.id, PROCESSED_LABEL)
        } catch (error) {
            console.error(`[poll-${config.domain}] reanudé el workflow pero no pude etiquetar ${message.id} como procesado`, error)
            try {
                await resolved.reader.addLabel(message.id, FAILED_LABEL)
            } catch (quarantineError) {
                console.error(`[poll-${config.domain}] tampoco pude poner en cuarentena ${message.id}`, quarantineError)
            }
        }
        processed++
    }

    return { processed, failed }
}
