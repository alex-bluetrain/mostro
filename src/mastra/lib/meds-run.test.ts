import { describe, it, expect, vi } from 'vitest'

vi.mock('@mastra/core/workflows', async (importActual) => {
    const actual = await importActual<typeof import('@mastra/core/workflows')>()
    return { ...actual, createWorkflowStateReader: vi.fn() }
})

import { createWorkflowStateReader } from '@mastra/core/workflows'
import { acknowledgeMedsOrder, confirmMedsDelivery } from './meds-run'

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

describe('acknowledgeMedsOrder', () => {
    it('returns not_found when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns not_suspended when status is not suspended', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('success')

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(result).toEqual({ ok: false, reason: 'not_suspended', status: 'success' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step when suspended at the confirmation step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('suspended', 'wait-meds-confirmation')

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'wait-meds-confirmation',
            expected: 'wait-meds-acknowledge',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with empty data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        reader('suspended', 'wait-meds-acknowledge')

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(resume).toHaveBeenCalledWith({ resumeData: {} })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})

describe('confirmMedsDelivery', () => {
    const payload = {
        deliveryDate: '2026-08-01',
        deliveryAddress: 'Av. Siempre Viva 742',
        yearMonth: '2026-08',
    }

    it('returns not_found when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await confirmMedsDelivery(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step when suspended at the acknowledge step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('suspended', 'wait-meds-acknowledge')

        const result = await confirmMedsDelivery(mastra, payload)

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'wait-meds-acknowledge',
            expected: 'wait-meds-confirmation',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with the delivery data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        reader('suspended', 'wait-meds-confirmation')

        const result = await confirmMedsDelivery(mastra, payload)

        expect(resume).toHaveBeenCalledWith({
            resumeData: {
                deliveryDate: '2026-08-01',
                deliveryAddress: 'Av. Siempre Viva 742',
            },
        })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})
