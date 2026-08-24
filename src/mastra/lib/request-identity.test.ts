import { describe, expect, it, vi } from 'vitest'
import { RequestContext, MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'
import { isRequestAdmin, resolveRequestUser, type RequestIdentityDeps } from './request-identity'
import type { IUser } from '@business'

const admin = { email: 'ana@example.com', name: 'Ana', role: 'admin' } as IUser
const member = { email: 'juan@example.com', name: 'Juan', role: 'member' } as IUser

function depsWith(overrides: Partial<RequestIdentityDeps> = {}): RequestIdentityDeps {
    return {
        getUserByEmail: vi.fn().mockResolvedValue(null),
        getUserByTelegramId: vi.fn().mockResolvedValue(null),
        getUserByDiscordId: vi.fn().mockResolvedValue(null),
        ...overrides,
    }
}

describe('resolveRequestUser', () => {
    it('resuelve por email cuando el resourceId canónico está seteado (web)', async () => {
        const deps = depsWith({ getUserByEmail: vi.fn().mockResolvedValue(admin) })
        const requestContext = new RequestContext()
        requestContext.set(MASTRA_RESOURCE_ID_KEY, 'Ana@Example.com ')

        const user = await resolveRequestUser(requestContext, deps)

        expect(user).toBe(admin)
        expect(deps.getUserByEmail).toHaveBeenCalledWith('ana@example.com')
    })

    it('resuelve por canal (platform + userId) cuando no hay resourceId', async () => {
        const deps = depsWith({ getUserByTelegramId: vi.fn().mockResolvedValue(member) })
        const requestContext = new RequestContext()
        requestContext.set('channel', { platform: 'telegram', userId: '12345' })

        const user = await resolveRequestUser(requestContext, deps)

        expect(user).toBe(member)
        expect(deps.getUserByTelegramId).toHaveBeenCalledWith('12345')
    })

    it('devuelve null sin requestContext o sin identidad (metadata reads)', async () => {
        const deps = depsWith()

        expect(await resolveRequestUser(undefined, deps)).toBeNull()
        expect(await resolveRequestUser(new RequestContext(), deps)).toBeNull()
    })

    it('cachea el lookup por RequestContext (el filter corre por candidato)', async () => {
        const getUserByEmail = vi.fn().mockResolvedValue(admin)
        const deps = depsWith({ getUserByEmail })
        const requestContext = new RequestContext()
        requestContext.set(MASTRA_RESOURCE_ID_KEY, 'ana@example.com')

        await resolveRequestUser(requestContext, deps)
        await resolveRequestUser(requestContext, deps)

        expect(getUserByEmail).toHaveBeenCalledTimes(1)
    })
})

describe('isRequestAdmin', () => {
    it('true solo para role admin', async () => {
        const adminCtx = new RequestContext()
        adminCtx.set(MASTRA_RESOURCE_ID_KEY, 'ana@example.com')
        const memberCtx = new RequestContext()
        memberCtx.set(MASTRA_RESOURCE_ID_KEY, 'juan@example.com')

        const deps = depsWith({
            getUserByEmail: vi.fn(async (email: string) => (email === admin.email ? admin : member)),
        })

        expect(await isRequestAdmin(adminCtx, deps)).toBe(true)
        expect(await isRequestAdmin(memberCtx, deps)).toBe(false)
        expect(await isRequestAdmin(undefined, deps)).toBe(false)
    })
})
