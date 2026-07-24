import { describe, it, expect, vi } from 'vitest'

vi.mock('@mastra/core/workflows', async (importActual) => {
    const actual = await importActual<typeof import('@mastra/core/workflows')>()
    return { ...actual, createWorkflowStateReader: vi.fn() }
})

import { createWorkflowStateReader } from '@mastra/core/workflows'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from './refunds-run'

const readerMock = vi.mocked(createWorkflowStateReader)

function buildMastra(opts: {
    existing: unknown
    resume?: ReturnType<typeof vi.fn>
}) {
    const resume = opts.resume ?? vi.fn().mockResolvedValue({ status: 'success' })
    const createRun = vi.fn().mockResolvedValue({ resume })
    const workflow = {
        getWorkflowRunById: vi.fn().mockResolvedValue(opts.existing),
        createRun,
    }
    const mastra = { getWorkflow: vi.fn().mockReturnValue(workflow) }
    return { mastra: mastra as never, workflow, createRun, resume }
}

function reader(status: string, suspendedStep?: string) {
    readerMock.mockReturnValue({
        getStatus: () => status,
        getSuspendedStep: () => (suspendedStep ? { stepId: suspendedStep } : undefined),
    } as never)
}

describe('acknowledgeRefund', () => {
    it('returns not_found and never resumes when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await acknowledgeRefund(mastra, '2026-08')

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns not_suspended and never resumes when status is not suspended', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('success')

        const result = await acknowledgeRefund(mastra, '2026-08')

        expect(result).toEqual({ ok: false, reason: 'not_suspended', status: 'success' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step when suspended at the confirmation step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('suspended', 'wait-refund-confirmation')

        const result = await acknowledgeRefund(mastra, '2026-08')

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'wait-refund-confirmation',
            expected: 'wait-refund-ack',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with empty data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        reader('suspended', 'wait-refund-ack')

        const result = await acknowledgeRefund(mastra, '2026-08')

        expect(resume).toHaveBeenCalledWith({ resumeData: {} })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})

describe('confirmRefund', () => {
    const payload = { refundReference: 'REF-123', yearMonth: '2026-08' }

    it('returns not_found when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await confirmRefund(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step when suspended at the acknowledge step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('suspended', 'wait-refund-ack')

        const result = await confirmRefund(mastra, payload)

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'wait-refund-ack',
            expected: 'wait-refund-confirmation',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with the refund reference on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        reader('suspended', 'wait-refund-confirmation')

        const result = await confirmRefund(mastra, payload)

        expect(resume).toHaveBeenCalledWith({ resumeData: { refundReference: 'REF-123' } })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})

describe('receiveDeposit', () => {
    const payload = { depositAmount: 500, depositDate: '2026-08-15', yearMonth: '2026-08' }

    it('returns not_found when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await receiveDeposit(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step when suspended at the confirmation step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('suspended', 'wait-refund-confirmation')

        const result = await receiveDeposit(mastra, payload)

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'wait-refund-confirmation',
            expected: 'wait-deposit',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with the deposit data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        reader('suspended', 'wait-deposit')

        const result = await receiveDeposit(mastra, payload)

        expect(resume).toHaveBeenCalledWith({
            resumeData: { depositAmount: 500, depositDate: '2026-08-15' },
        })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})
