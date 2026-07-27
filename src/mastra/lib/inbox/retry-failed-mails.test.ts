import { describe, it, expect, vi } from 'vitest'
import { retryFailedMails } from './retry-failed-mails'

describe('retryFailedMails', () => {
    it('le saca el label de fallo a los mails trabados del remitente', async () => {
        const removeLabel = vi.fn().mockResolvedValue(undefined)
        const search = vi.fn().mockResolvedValue([
            { id: 'm1', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
            { id: 'm2', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
        ])

        const count = await retryFailedMails('a@b.test', { search, removeLabel, addLabel: vi.fn() })

        expect(search).toHaveBeenCalledWith('from:a@b.test label:mostro-failed')
        expect(removeLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(removeLabel).toHaveBeenCalledWith('m2', 'mostro-failed')
        expect(count).toBe(2)
    })

    it('devuelve cero cuando no hay nada trabado', async () => {
        const removeLabel = vi.fn()
        const count = await retryFailedMails('a@b.test', {
            search: vi.fn().mockResolvedValue([]),
            removeLabel,
            addLabel: vi.fn(),
        })

        expect(count).toBe(0)
        expect(removeLabel).not.toHaveBeenCalled()
    })
})
