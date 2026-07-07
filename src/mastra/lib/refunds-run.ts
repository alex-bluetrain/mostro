import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { WorkflowStateStepResult } from '@mastra/core/workflows'
import { getRefundsRunId } from '../workflows/refunds/utils/refunds.utils'

function getRefundsWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('refundsWorkflow')
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

export async function readRefundsStatus(mastra: Mastra, orderId: string) {
    const workflow = getRefundsWorkflow(mastra)
    const state = await workflow.getWorkflowRunById(getRefundsRunId(orderId))

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

export async function startRefundRequest(
    mastra: Mastra,
    input: { orderId: string; amount: number; reason?: string },
) {
    const runId = getRefundsRunId(input.orderId)
    const workflow = getRefundsWorkflow(mastra)
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
        inputData: { orderId: input.orderId, amount: input.amount, reason: input.reason },
    })

    return { alreadyInProgress: false as const, result }
}

export async function acknowledgeRefund(mastra: Mastra, orderId: string) {
    const workflow = getRefundsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getRefundsRunId(orderId) })

    return run.resume({ resumeData: {} })
}

export async function confirmRefund(
    mastra: Mastra,
    payload: { orderId: string; refundReference: string },
) {
    const workflow = getRefundsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getRefundsRunId(payload.orderId) })

    return run.resume({ resumeData: { refundReference: payload.refundReference } })
}

export async function receiveDeposit(
    mastra: Mastra,
    payload: { orderId: string; depositAmount: number; depositDate: string },
) {
    const workflow = getRefundsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getRefundsRunId(payload.orderId) })

    return run.resume({
        resumeData: { depositAmount: payload.depositAmount, depositDate: payload.depositDate },
    })
}
