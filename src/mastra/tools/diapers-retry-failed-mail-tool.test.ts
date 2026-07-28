import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@business/identity', () => ({ getUserByResourceId: vi.fn() }))
vi.mock('@lib/inbox/retry-failed-mails', () => ({ retryFailedMails: vi.fn() }))

import { getUserByResourceId } from '@business/identity'
import { retryFailedMails } from '@lib/inbox/retry-failed-mails'
import { retryDiapersFailedMailTool } from './diapers-retry-failed-mail-tool'

const admin = { email: 'admin@gmail.com', name: 'Admin', role: 'admin' as const, addedAt: 1 }

function run(resourceId = 'admin@gmail.com') {
    return (retryDiapersFailedMailTool as never as {
        execute: (input: unknown, context: unknown) => Promise<{ ok: boolean; retried?: number; outOfWindow?: number; error?: string }>
    }).execute({}, { agent: { resourceId } })
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getUserByResourceId).mockResolvedValue(admin)
    vi.mocked(retryFailedMails).mockResolvedValue({ retried: 2, outOfWindow: 0 })
})

describe('retryDiapersFailedMailTool', () => {
    it('devuelve los mails a la cola cuando el llamador es admin', async () => {
        const result = await run()

        expect(result).toEqual({ ok: true, retried: 2, outOfWindow: 0 })
        expect(retryFailedMails).toHaveBeenCalledWith('panales@proveedor.test')
    })

    it('rechaza a los llamadores que no son admin', async () => {
        vi.mocked(getUserByResourceId).mockResolvedValue({ ...admin, role: 'member' })

        const result = await run()

        expect(result.ok).toBe(false)
        expect(result.error).toContain('admin')
        expect(retryFailedMails).not.toHaveBeenCalled()
    })

    it('rechaza cuando no hay identidad del llamador', async () => {
        const result = await (retryDiapersFailedMailTool as never as {
            execute: (input: unknown, context: unknown) => Promise<{ ok: boolean; error?: string }>
        }).execute({}, {})

        expect(result.ok).toBe(false)
        expect(retryFailedMails).not.toHaveBeenCalled()
    })
})
