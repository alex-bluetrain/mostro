import { describe, it, expect, vi } from 'vitest'
import { retryFailedMails } from './retry-failed-mails'

describe('retryFailedMails', () => {
    it('le saca el label de fallo a los mails dentro de la ventana', async () => {
        const removeLabel = vi.fn().mockResolvedValue(undefined)
        const search = vi.fn()
            .mockResolvedValueOnce([
                { id: 'm1', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
                { id: 'm2', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
            ])
            .mockResolvedValueOnce([])

        const result = await retryFailedMails('a@b.test', { search, removeLabel, addLabel: vi.fn() })

        expect(search).toHaveBeenCalledWith('from:a@b.test label:mostro-failed newer_than:30d')
        expect(search).toHaveBeenCalledWith('from:a@b.test label:mostro-failed -newer_than:30d')
        expect(removeLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(removeLabel).toHaveBeenCalledWith('m2', 'mostro-failed')
        expect(result).toEqual({ retried: 2, outOfWindow: 0 })
    })

    it('devuelve cero cuando no hay nada trabado', async () => {
        const removeLabel = vi.fn()
        const search = vi.fn().mockResolvedValue([])

        const result = await retryFailedMails('a@b.test', {
            search,
            removeLabel,
            addLabel: vi.fn(),
        })

        expect(result).toEqual({ retried: 0, outOfWindow: 0 })
        expect(removeLabel).not.toHaveBeenCalled()
    })

    it('no pierde mails fuera de la ventana ni les quita el label', async () => {
        const removeLabel = vi.fn().mockResolvedValue(undefined)
        const search = vi.fn()
            .mockResolvedValueOnce([
                { id: 'm1', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
            ])
            .mockResolvedValueOnce([
                { id: 'm_old', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
                { id: 'm_old2', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
            ])

        const result = await retryFailedMails('a@b.test', { search, removeLabel, addLabel: vi.fn() })

        expect(removeLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(removeLabel).not.toHaveBeenCalledWith('m_old', 'mostro-failed')
        expect(removeLabel).not.toHaveBeenCalledWith('m_old2', 'mostro-failed')
        expect(result).toEqual({ retried: 1, outOfWindow: 2 })
    })
})
