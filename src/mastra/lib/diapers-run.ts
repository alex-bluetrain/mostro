import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { WorkflowStateStepResult } from '@mastra/core/workflows'
import { DIAPERS_RUN_ID } from '../workflows/diapers-workflow'

function getDiapersWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('diapersWorkflow')
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

export async function readDiapersStatus(mastra: Mastra) {
    const workflow = getDiapersWorkflow(mastra)
    const state = await workflow.getWorkflowRunById(DIAPERS_RUN_ID)

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

export async function startDiapers(
    mastra: Mastra,
    input: { diaperType: string; quantity: number },
) {
    const workflow = getDiapersWorkflow(mastra)
    const existing = await workflow.getWorkflowRunById(DIAPERS_RUN_ID)

    if (existing) {
        const reader = createWorkflowStateReader(existing)
        const status = reader.getStatus()
        if (status === 'suspended' || status === 'running') {
            return { alreadyInProgress: true as const, status }
        }
    }

    const run = await workflow.createRun({ runId: DIAPERS_RUN_ID })
    const result = await run.start({ inputData: input })

    return { alreadyInProgress: false as const, result }
}

export async function confirmDiapersDate(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string },
) {
    const workflow = getDiapersWorkflow(mastra)
    const run = await workflow.createRun({ runId: DIAPERS_RUN_ID })

    return run.resume({ resumeData: payload })
}
