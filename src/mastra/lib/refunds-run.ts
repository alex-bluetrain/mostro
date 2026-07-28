import type { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { RefundsState } from '@workflows/refunds/types/refunds-state.type'
import { getRefundsRunId } from '@workflows/refunds/utils/refunds.utils'
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
    input: { amount: number; reason?: string; yearMonth?: string; requestedBy: string },
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
        initialState: { requestedBy: input.requestedBy },
    })

    // run.start() no lanza: un step que falla vuelve como status 'failed'. Sin esto,
    // el agente recibiría un objeto opaco y podría anunciar un pedido que nunca salió.
    if (result.status === 'failed') {
        return {
            alreadyInProgress: false as const,
            ok: false as const,
            reason: 'send_failed' as const,
            message: 'No pude enviar la solicitud de reintegro. Volvé a intentarlo en un rato.',
        }
    }

    return { alreadyInProgress: false as const, ok: true as const, result }
}

export async function acknowledgeRefund(mastra: Mastra, yearMonth: string) {
    const workflow = getRefundsWorkflow(mastra)
    const runId = getRefundsRunId(yearMonth)
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
    const expected = 'wait-refund-ack'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({ resumeData: {} })

    return { ok: true as const, result }
}

export async function confirmRefund(
    mastra: Mastra,
    payload: { refundReference: string; yearMonth: string },
) {
    const workflow = getRefundsWorkflow(mastra)
    const runId = getRefundsRunId(payload.yearMonth)
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
    const expected = 'wait-refund-confirmation'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({ resumeData: { refundReference: payload.refundReference } })

    return { ok: true as const, result }
}

export async function receiveDeposit(
    mastra: Mastra,
    payload: { depositAmount: number; depositDate: string; yearMonth: string },
) {
    const workflow = getRefundsWorkflow(mastra)
    const runId = getRefundsRunId(payload.yearMonth)
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
    const expected = 'wait-deposit'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({
        resumeData: { depositAmount: payload.depositAmount, depositDate: payload.depositDate },
    })

    return { ok: true as const, result }
}
