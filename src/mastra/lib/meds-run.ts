import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { MedsState } from '../workflows/meds/types/meds-state.type'
import { getMedsRunId } from '../workflows/meds/utils/meds.utils';
import { getCurrentYearMonth } from './date-scope'

function getMedsWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('medsWorkflow')
}

export async function readMedsStatus(mastra: Mastra, yearMonth: string = getCurrentYearMonth()) {
    const workflow = getMedsWorkflow(mastra)
    const run = await workflow.getWorkflowRunById(getMedsRunId(yearMonth))

    if (!run?.initialState || Object.keys(run.initialState).length === 0) {
        return null
    }

    return run.initialState as MedsState
}

export async function startMedsOrder(
    mastra: Mastra,
    input: { medications: string[]; yearMonth?: string },
) {
    const yearMonth = input.yearMonth ?? getCurrentYearMonth()
    const runId = getMedsRunId(yearMonth)
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
    await run.start({ inputData: {} })
    const result = await run.resume({ resumeData: { medications: input.medications } })

    return { alreadyInProgress: false as const, result }
}

export async function acknowledgeMedsOrder(mastra: Mastra, yearMonth: string) {
    const workflow = getMedsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getMedsRunId(yearMonth) })

    return run.resume({ resumeData: {} })
}

export async function confirmMedsDelivery(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; yearMonth: string },
) {
    const workflow = getMedsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getMedsRunId(payload.yearMonth) })

    return run.resume({ resumeData: { deliveryDate: payload.deliveryDate, deliveryAddress: payload.deliveryAddress } })
}
