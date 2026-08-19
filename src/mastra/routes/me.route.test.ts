import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@business/identity', () => ({
    getUserByResourceId: vi.fn(),
}))

import { meRoute } from './me.route'
import { getUserByResourceId } from '@business/identity'
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'

// El handler sólo usa `get('requestContext')` y `json()`, así que el contexto
// de Hono se puede falsear con esas dos cosas y el test no arranca un server.
function run(resourceId?: string): Promise<{ body: unknown; status?: number }> {
    const c = {
        get: (key: string) =>
            key === 'requestContext'
                ? { get: (k: string) => (k === MASTRA_RESOURCE_ID_KEY ? resourceId : undefined) }
                : undefined,
        json: (body: unknown, status?: number) => ({ body, status }),
    }
    const handler = (meRoute as { handler: (c: unknown) => Promise<{ body: unknown; status?: number }> }).handler
    return handler(c)
}

describe('meRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns the caller identity, role and preferences', async () => {
        vi.mocked(getUserByResourceId).mockResolvedValue({
            email: 'ana@gmail.com',
            name: 'Ana',
            role: 'admin',
            addedAt: 1,
            preferences: { notifications: true },
        } as any)

        const response = await run('ana@gmail.com')

        expect(getUserByResourceId).toHaveBeenCalledWith('ana@gmail.com')
        expect(response.body).toEqual({
            email: 'ana@gmail.com',
            name: 'Ana',
            role: 'admin',
            preferences: { notifications: true },
        })
    })

    it('defaults notifications to false for users predating the preferences field', async () => {
        vi.mocked(getUserByResourceId).mockResolvedValue({
            email: 'ana@gmail.com',
            name: 'Ana',
            role: 'member',
            addedAt: 1,
        } as any)

        const response = await run('ana@gmail.com')

        expect(response.body).toMatchObject({ preferences: { notifications: false } })
    })

    it('401s when the request context has no resource id', async () => {
        const response = await run(undefined)

        expect(response.status).toBe(401)
        expect(getUserByResourceId).not.toHaveBeenCalled()
    })

    it('404s when the resource id resolves to no user', async () => {
        vi.mocked(getUserByResourceId).mockResolvedValue(null)

        const response = await run('ghost@gmail.com')

        expect(response.status).toBe(404)
    })
})
