import { describe, expect, it, vi } from 'vitest'
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import { webThreadMiddleware } from './web-thread'

function contextWith(entries: Record<string, unknown>) {
    const store = new Map(Object.entries(entries))
    return {
        get: (key: string) => (key === 'requestContext' ? store : undefined),
        json: vi.fn((body: unknown, status: number) => ({ body, status })),
    } as any
}

describe('webThreadMiddleware', () => {
    it('deriva el thread del resourceId que puso el auth', async () => {
        const c = contextWith({ [MASTRA_RESOURCE_ID_KEY]: 'ana@gmail.com' })
        const next = vi.fn()

        await webThreadMiddleware(c, next)

        expect(c.get('requestContext').get(MASTRA_THREAD_ID_KEY)).toBe('ana@gmail.com:web')
        expect(next).toHaveBeenCalled()
    })

    // El thread se computa del token, no del body: mandar identidad ajena no
    // cambia a que memoria entra la conversacion.
    it('ignora el thread que venga del cliente', async () => {
        const c = contextWith({
            [MASTRA_RESOURCE_ID_KEY]: 'ana@gmail.com',
            [MASTRA_THREAD_ID_KEY]: 'victima@example.com:web',
        })

        await webThreadMiddleware(c, vi.fn())

        expect(c.get('requestContext').get(MASTRA_THREAD_ID_KEY)).toBe('ana@gmail.com:web')
    })

    it('sin resourceId corta con 401', async () => {
        const c = contextWith({})
        const next = vi.fn()

        await webThreadMiddleware(c, next)

        expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
        expect(next).not.toHaveBeenCalled()
    })
})
