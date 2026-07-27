import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { z } from 'zod'
import { previousYearMonth, yearMonthOf } from '../date-scope'
import { FAILED_LABEL, PROCESSED_LABEL, gmailReader, type GmailReader, type InboxMessage } from './gmail-reader'
import { extractFromMail, type Extract } from './mail-extractor'
import { notifyMailFailure, type NotifyFailure } from './notify-mail-failure'

export type ResumeResult = { ok: boolean; reason?: string }

export type StepConfig = {
    schema: z.ZodType
    description: string
    resume: (mastra: unknown, data: Record<string, unknown>, yearMonth: string) => Promise<ResumeResult>
}

export type PollConfig = {
    domain: 'diapers' | 'meds' | 'refunds'
    sender: string
    workflowId: string
    getRunId: (yearMonth: string) => string
    steps: Record<string, StepConfig>
}

export type PollDeps = {
    // search() debe devolver los mails del más viejo al más nuevo: un acuse tiene que
    // procesarse antes que la confirmación que lo sigue, o esta se evalúa contra un
    // step que todavía no avanzó. gmailReader ya lo garantiza (gmail-reader.ts); un
    // reader alternativo que no lo respete rompe el escenario central en silencio,
    // sin que falle ningún test.
    reader: GmailReader
    extract: Extract
    notifyFailure: NotifyFailure
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
    notifyFailure: notifyMailFailure,
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
    const query = `from:${config.sender} -label:${PROCESSED_LABEL} -label:${FAILED_LABEL} newer_than:30d`
    const messages = await resolved.reader.search(query)

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
            await resolved.notifyFailure(mastra, {
                domain: config.domain,
                from: message.from,
                subject: message.subject,
                reason,
            })
        } catch (error) {
            console.error(`[poll-${config.domain}] no pude avisar del fallo de ${message.id}`, error)
        }
    }

    for (const message of messages) {
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
        // Sin la etiqueta el mail vuelve a la cola y el próximo ciclo lo reintenta, pero
        // ahí el run ya no está suspendido en ese step y cae a mostro-failed con motivo,
        // que es visible. Propagar en cambio dejaría el resto de la tanda sin procesar.
        try {
            await resolved.reader.addLabel(message.id, PROCESSED_LABEL)
        } catch (error) {
            console.error(`[poll-${config.domain}] reanudé el workflow pero no pude etiquetar ${message.id} como procesado`, error)
        }
        processed++
    }

    return { processed, failed }
}
