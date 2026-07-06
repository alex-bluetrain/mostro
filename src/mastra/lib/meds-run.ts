import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { WorkflowStateStepResult } from '@mastra/core/workflows'
import { getMedsRunId } from '../workflows/meds/utils/meds.utils';
import { getCurrentYearMonth } from './date-scope'

function getMedsWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('medsWorkflow')
}

const ACTIVE_STEP_STATUSES = new Set(['running', 'suspended', 'waiting', 'paused'])

function findActiveStep(steps?: Record<string, WorkflowStateStepResult>) {
    if (!steps) return undefined

    for (const [stepId, result] of Object.entries(steps)) {
        const current = Array.isArray(result) ? result.at(-1) : result
        if (current && ACTIVE_STEP_STATUSES.has(current.status)) {
            return { stepId, ...current }
        }
    }

    return undefined
}

export async function readMedsStatus(mastra: Mastra, yearMonth: string = getCurrentYearMonth()) {
    const workflow = getMedsWorkflow(mastra)
    const state = await workflow.getWorkflowRunById(getMedsRunId(yearMonth))

    if (!state) {
        return {
            status: 'idle',
            currentStep: 'n/a',
            startedAt: 'n/a',
            suspendedAt: 'n/a',
            result: 'n/a',
        }
    }

    const reader = createWorkflowStateReader(state)
    const activeStep = findActiveStep(state.steps)

    return {
        status: reader.getStatus(),
        currentStep: activeStep?.stepId,
        startedAt: activeStep?.startedAt,
        suspendedAt: activeStep?.suspendedAt,
        result: reader.getResult(),
    }
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
