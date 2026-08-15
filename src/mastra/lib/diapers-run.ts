import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { DiapersState } from '@workflows/diapers/types/diapers-state.type'
import { getDiapersRunId } from '@workflows/diapers/utils/diapers.utils'

function getDiapersWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('diapersWorkflow')
}

export async function readDiapersStatus(mastra: Mastra, year: number, month: number) {
    const workflow = getDiapersWorkflow(mastra)
    const run = await workflow.getWorkflowRunById(getDiapersRunId(year, month))

    if (!run?.initialState || Object.keys(run.initialState).length === 0) {
        return null
    }

    return run.initialState as DiapersState
}

export async function startDiapers(
    mastra: Mastra,
    input: { size: 'M' | 'G' | 'XG'; year: number; month: number; requestedBy: string },
) {
    const runId = getDiapersRunId(input.year, input.month)
    const workflow = getDiapersWorkflow(mastra)
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
        inputData: { size: input.size, requestedBy: input.requestedBy },
        initialState: { requestedBy: input.requestedBy, year: input.year, month: input.month },
    })

    // run.start() no lanza: un step que falla vuelve como status 'failed'. Sin esto,
    // el agente recibiría un objeto opaco y podría anunciar un pedido que nunca salió.
    if (result.status === 'failed') {
        return {
            alreadyInProgress: false as const,
            ok: false as const,
            reason: 'send_failed' as const,
            message: 'No pude enviar el pedido. Volvé a intentarlo en un rato.',
        }
    }

    return { alreadyInProgress: false as const, ok: true as const, result }
}

export async function confirmDiapersDate(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; quantity: number; year: number; month: number },
) {
    const workflow = getDiapersWorkflow(mastra)
    const runId = getDiapersRunId(payload.year, payload.month)
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
    const expected = 'wait-diapers-confirmation'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({
        resumeData: {
            deliveryDate: payload.deliveryDate,
            deliveryAddress: payload.deliveryAddress,
            quantity: payload.quantity,
        },
    })

    return { ok: true as const, result }
}
