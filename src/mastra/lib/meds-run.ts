import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { MedsState } from '@workflows/meds/types/meds-state.type'
import { getMedsRunId } from '@workflows/meds/utils/meds.utils';

function getMedsWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('medsWorkflow')
}

export async function readMedsStatus(mastra: Mastra, year: number, month: number) {
    const workflow = getMedsWorkflow(mastra)
    const run = await workflow.getWorkflowRunById(getMedsRunId(year, month))

    if (!run?.initialState || Object.keys(run.initialState).length === 0) {
        return null
    }

    return run.initialState as MedsState
}

export async function startMedsOrder(
    mastra: Mastra,
    input: { medications: string[]; year: number; month: number; requestedBy: string },
) {
    const runId = getMedsRunId(input.year, input.month)
    const workflow = getMedsWorkflow(mastra)
    const existing = await workflow.getWorkflowRunById(runId)

    if (existing) {
        const reader = createWorkflowStateReader(existing)
        const status = reader.getStatus()
        if (status === 'suspended' || status === 'running') {
            return { alreadyInProgress: true as const, status }
        }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.start({
        inputData: { medications: input.medications, requestedBy: input.requestedBy },
        initialState: { requestedBy: input.requestedBy, year: input.year, month: input.month },
    })

    // run.start() no lanza: un step que falla vuelve como status 'failed'. Sin esto,
    // el agente recibiría un objeto opaco y podría anunciar un pedido que nunca salió.
    if (result.status === 'failed') {
        return {
            alreadyInProgress: false as const,
            ok: false as const,
            reason: 'send_failed' as const,
            message: 'No pude enviar el pedido de medicamentos. Volvé a intentarlo en un rato.',
        }
    }

    return { alreadyInProgress: false as const, ok: true as const, result }
}

export async function acknowledgeMedsOrder(mastra: Mastra, year: number, month: number) {
    const workflow = getMedsWorkflow(mastra)
    const runId = getMedsRunId(year, month)
    const existing = await workflow.getWorkflowRunById(runId)

    if (!existing) {
        return { ok: false as const, reason: 'not_found' as const }
    }

    const reader = createWorkflowStateReader(existing)
    const status = reader.getStatus()
    if (status !== 'suspended') {
        return { ok: false as const, reason: 'not_suspended' as const, status }
    }

    const suspendedStep = reader.getSuspendedStep()?.stepId
    const expected = 'wait-meds-acknowledge'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({ resumeData: {} })

    return { ok: true as const, result }
}

export async function confirmMedsDelivery(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; year: number; month: number },
) {
    const workflow = getMedsWorkflow(mastra)
    const runId = getMedsRunId(payload.year, payload.month)
    const existing = await workflow.getWorkflowRunById(runId)

    if (!existing) {
        return { ok: false as const, reason: 'not_found' as const }
    }

    const reader = createWorkflowStateReader(existing)
    const status = reader.getStatus()
    if (status !== 'suspended') {
        return { ok: false as const, reason: 'not_suspended' as const, status }
    }

    const suspendedStep = reader.getSuspendedStep()?.stepId
    const expected = 'wait-meds-confirmation'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({
        resumeData: {
            deliveryDate: payload.deliveryDate,
            deliveryAddress: payload.deliveryAddress,
        },
    })

    return { ok: true as const, result }
}
