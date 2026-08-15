import { describe, it, expect, vi } from 'vitest'

vi.mock('@mastra/core/workflows', async (importActual) => {
    const actual = await importActual<typeof import('@mastra/core/workflows')>()
    return { ...actual, createWorkflowStateReader: vi.fn() }
})

import { createWorkflowStateReader } from '@mastra/core/workflows'
import { confirmDiapersDate, startDiapers } from './diapers-run'

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

const payload = {
    deliveryDate: '2026-08-01',
    deliveryAddress: 'Av. Siempre Viva 742',
    quantity: 12,
    year: 2026,
    month: 8,
}

describe('confirmDiapersDate', () => {
    it('returns not_found and never resumes when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await confirmDiapersDate(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns not_suspended and never resumes when status is not suspended', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        readerMock.mockReturnValue({
            getStatus: () => 'success',
            getSuspendedStep: () => undefined,
        } as never)

        const result = await confirmDiapersDate(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_suspended', status: 'success' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step and never resumes when suspended at another step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        readerMock.mockReturnValue({
            getStatus: () => 'suspended',
            getSuspendedStep: () => ({ stepId: 'notify-users' }),
        } as never)

        const result = await confirmDiapersDate(mastra, payload)

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'notify-users',
            expected: 'wait-diapers-confirmation',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with the confirmation data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        readerMock.mockReturnValue({
            getStatus: () => 'suspended',
            getSuspendedStep: () => ({ stepId: 'wait-diapers-confirmation' }),
        } as never)

        const result = await confirmDiapersDate(mastra, payload)

        expect(resume).toHaveBeenCalledWith({
            resumeData: {
                deliveryDate: '2026-08-01',
                deliveryAddress: 'Av. Siempre Viva 742',
                quantity: 12,
            },
        })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})

function buildStartMastra(start: ReturnType<typeof vi.fn>) {
    const createRun = vi.fn().mockResolvedValue({ start })
    const workflow = {
        getWorkflowRunById: vi.fn().mockResolvedValue(null),
        createRun,
    }
    const mastra = { getWorkflow: vi.fn().mockReturnValue(workflow) }
    return mastra as never
}

describe('startDiapers', () => {
    it('reports send_failed when the run fails', async () => {
        const start = vi.fn().mockResolvedValue({
            status: 'failed',
            error: new Error('No se pudo enviar el correo'),
        })

        const result = await startDiapers(buildStartMastra(start), {
            size: 'M',
            requestedBy: 'Ana',
            year: 2026,
            month: 7,
        })

        expect(result).toMatchObject({ ok: false, reason: 'send_failed' })
        expect((result as { message?: string }).message).toContain('No pude enviar')
    })

    it('reports ok when the run suspends waiting for the supplier', async () => {
        const start = vi.fn().mockResolvedValue({ status: 'suspended' })

        const result = await startDiapers(buildStartMastra(start), {
            size: 'M',
            requestedBy: 'Ana',
            year: 2026,
            month: 7,
        })

        expect(result).toMatchObject({ ok: true, alreadyInProgress: false })
    })
})
