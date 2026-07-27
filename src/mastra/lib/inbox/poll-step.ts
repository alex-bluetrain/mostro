import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { runPollCycle, type PollConfig, type ResumeResult } from './poll-mailbox'

type RunOutcome = {
    ok: boolean
    reason?: string
    result?: { status?: string }
}

// run.resume() no lanza cuando un step falla: devuelve el resultado con status 'failed'.
// Sin este chequeo, un workflow que reanuda pero después explota dejaría el mail
// etiquetado como procesado y nadie se enteraría. 'suspended' NO es fallo: meds y refunds
// vuelven a suspenderse en la etapa siguiente, que es el camino feliz.
export function toResumeResult(outcome: RunOutcome): ResumeResult {
    if (!outcome.ok) {
        return { ok: false, reason: outcome.reason ?? 'sin motivo' }
    }
    if (outcome.result?.status === 'failed') {
        return { ok: false, reason: 'el workflow reanudó pero falló al ejecutar' }
    }
    return { ok: true }
}

export const pollOutputSchema = z.object({ processed: z.number(), failed: z.number() })

// runPollCycle deja reader.search sin guarda a propósito: si Gmail no responde no hay
// tanda que salvar. Pero lo logueamos antes de propagar, para que el trigger fallido del
// historial de schedules tenga una causa legible.
export function createPollStep(id: string, config: PollConfig) {
    return createStep({
        id,
        inputSchema: z.object({}),
        outputSchema: pollOutputSchema,
        execute: async ({ mastra }) => {
            try {
                return await runPollCycle(mastra, config)
            } catch (error) {
                console.error(`[${id}] el ciclo de polling no pudo completarse`, error)
                throw error
            }
        },
    })
}
