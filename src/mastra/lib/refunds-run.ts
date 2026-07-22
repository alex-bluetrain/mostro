import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { RefundsState } from '../workflows/refunds/types/refunds-state.type'
import { getRefundsRunId } from '../workflows/refunds/utils/refunds.utils'
import { getCurrentYearMonth } from './date-scope'

function getRefundsWorkflow(mastra: Mastra) {
    return mastra.getWorkflow('refundsWorkflow')
}

export async function readRefundsStatus(mastra: Mastra, yearMonth: string = getCurrentYearMonth()) {
    const workflow = getRefundsWorkflow(mastra)
    const run = await workflow.getWorkflowRunById(getRefundsRunId(yearMonth))

    if (!run?.initialState || Object.keys(run.initialState).length === 0) {
        return null
    }

    return run.initialState as RefundsState
}

export async function startRefundRequest(
    mastra: Mastra,
    input: { amount: number; reason?: string; yearMonth?: string; requestedBy?: string },
) {
    const yearMonth = input.yearMonth ?? getCurrentYearMonth()
    const runId = getRefundsRunId(yearMonth)
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
        inputData: { amount: input.amount, reason: input.reason, requestedBy: input.requestedBy },
    })

    return { alreadyInProgress: false as const, result }
}

export async function acknowledgeRefund(mastra: Mastra, yearMonth: string) {
    const workflow = getRefundsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getRefundsRunId(yearMonth) })

    return run.resume({ resumeData: {} })
}

export async function confirmRefund(
    mastra: Mastra,
    payload: { refundReference: string; yearMonth: string },
) {
    const workflow = getRefundsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getRefundsRunId(payload.yearMonth) })

    return run.resume({ resumeData: { refundReference: payload.refundReference } })
}

export async function receiveDeposit(
    mastra: Mastra,
    payload: { depositAmount: number; depositDate: string; yearMonth: string },
) {
    const workflow = getRefundsWorkflow(mastra)
    const run = await workflow.createRun({ runId: getRefundsRunId(payload.yearMonth) })

    return run.resume({
        resumeData: { depositAmount: payload.depositAmount, depositDate: payload.depositDate },
    })
}
