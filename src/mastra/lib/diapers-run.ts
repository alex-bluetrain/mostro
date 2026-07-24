import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { DiapersState } from '../workflows/diapers/types/diapers-state.type'
import { getDiapersRunId } from '../workflows/diapers/utils/diapers.utils'
import { getCurrentYearMonth } from './date-scope'

function getDiapersWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('diapersWorkflow')
}

export async function readDiapersStatus(mastra: Mastra, yearMonth: string = getCurrentYearMonth()) {
    const workflow = getDiapersWorkflow(mastra)
    const run = await workflow.getWorkflowRunById(getDiapersRunId(yearMonth))

    if (!run?.initialState || Object.keys(run.initialState).length === 0) {
        return null
    }

    return run.initialState as DiapersState
}

export async function startDiapers(
    mastra: Mastra,
    input: { size: 'M' | 'G' | 'XG'; yearMonth?: string; requestedBy?: string },
) {
    const yearMonth = input.yearMonth ?? getCurrentYearMonth()
    const runId = getDiapersRunId(yearMonth)
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
    const result = await run.start({ inputData: { size: input.size, requestedBy: input.requestedBy } })

    return { alreadyInProgress: false as const, result }
}

export async function confirmDiapersDate(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; quantity: number; yearMonth: string },
) {
    const workflow = getDiapersWorkflow(mastra)
    const runId = getDiapersRunId(payload.yearMonth)
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
