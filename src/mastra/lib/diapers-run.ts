import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { WorkflowStateStepResult } from '@mastra/core/workflows'
import { getDiapersRunId } from '../workflows/diapers-workflow'

function getDiapersWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('diapersWorkflow')
}

// YYYY-MM en horario local, usado como default cuando no se especifica el mes.
export function getCurrentYearMonth(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
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

export async function readDiapersStatus(mastra: Mastra, yearMonth: string = getCurrentYearMonth()) {
    const workflow = getDiapersWorkflow(mastra)
    const state = await workflow.getWorkflowRunById(getDiapersRunId(yearMonth))

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
    input: { diaperType: string; quantity: number; yearMonth?: string },
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
    const result = await run.start({ inputData: { diaperType: input.diaperType, quantity: input.quantity } })

    return { alreadyInProgress: false as const, result }
}

export async function confirmDiapersDate(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; yearMonth: string },
) {
    const workflow = getDiapersWorkflow(mastra)
    const run = await workflow.createRun({ runId: getDiapersRunId(payload.yearMonth) })

    return run.resume({ resumeData: { deliveryDate: payload.deliveryDate, deliveryAddress: payload.deliveryAddress } })
}
