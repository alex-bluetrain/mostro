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
    input: { diaperType: string; yearMonth?: string; requestedBy?: string },
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
    const result = await run.start({ inputData: { diaperType: input.diaperType, requestedBy: input.requestedBy } })

    return { alreadyInProgress: false as const, result }
}

export async function confirmDiapersDate(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; quantity: number; yearMonth: string },
) {
    const workflow = getDiapersWorkflow(mastra)
    const run = await workflow.createRun({ runId: getDiapersRunId(payload.yearMonth) })

    return run.resume({ resumeData: { deliveryDate: payload.deliveryDate, deliveryAddress: payload.deliveryAddress, quantity: payload.quantity } })
}
