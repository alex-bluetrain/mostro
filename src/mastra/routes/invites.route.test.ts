import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@config/app.config', () => ({
    appConfig: { TELEGRAM_BOT_USERNAME: 'mostro_bot' },
}))
vi.mock('@business/identity', () => ({
    getUserByResourceId: vi.fn(),
}))
vi.mock('@business/repositories', () => ({
    inviteRepository: { list: vi.fn(), create: vi.fn() },
    userRepository: { findByEmail: vi.fn() },
}))

import { createInviteRoute, listInvitesRoute } from './invites.route'
import { getUserByResourceId } from '@business/identity'
import { inviteRepository, userRepository } from '@business/repositories'
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'
import { nowUnix } from '@lib/unix-time'

type Response = { body: any; status?: number }

function run(route: unknown, resourceId?: string, body?: unknown): Promise<Response> {
    const c = {
        get: (key: string) =>
            key === 'requestContext'
                ? { get: (k: string) => (k === MASTRA_RESOURCE_ID_KEY ? resourceId : undefined) }
                : undefined,
        req: { json: async () => body },
        json: (b: unknown, status?: number) => ({ body: b, status }),
    }
    return (route as { handler: (c: unknown) => Promise<Response> }).handler(c)
}

const admin = { email: 'admin@gmail.com', name: 'Admin', role: 'admin', addedAt: 1, preferences: { notifications: false } }

describe('invites routes', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getUserByResourceId).mockResolvedValue(admin as any)
        vi.mocked(userRepository.findByEmail).mockResolvedValue(null)
    })

    it('403s a member: the auth provider proves invitation, not role', async () => {
        vi.mocked(getUserByResourceId).mockResolvedValue({ ...admin, role: 'member' } as any)

        const list = await run(listInvitesRoute, 'member@gmail.com')
        const create = await run(createInviteRoute, 'member@gmail.com', { email: 'new@gmail.com' })

        expect(list.status).toBe(403)
        expect(create.status).toBe(403)
        expect(inviteRepository.create).not.toHaveBeenCalled()
    })

    it('403s when the request carries no resource id', async () => {
        const response = await run(listInvitesRoute, undefined)

        expect(response.status).toBe(403)
        expect(getUserByResourceId).not.toHaveBeenCalled()
    })

    it('lists invites with their derived status and redeem link', async () => {
        const now = nowUnix()
        vi.mocked(inviteRepository.list).mockResolvedValue([
            { code: 'used1', email: 'a@gmail.com', createdBy: admin.email, createdAt: 1, expiresAt: now + 100, usedBy: '42' },
            { code: 'old1', email: 'b@gmail.com', createdBy: admin.email, createdAt: 1, expiresAt: now - 100 },
            { code: 'new1', email: 'c@gmail.com', createdBy: admin.email, createdAt: 1, expiresAt: now + 100 },
        ] as any)

        const response = await run(listInvitesRoute, admin.email)

        expect(response.body.invites.map((i: any) => i.status)).toEqual(['used', 'expired', 'pending'])
        expect(response.body.invites[2].link).toBe('https://t.me/mostro_bot?start=new1')
        expect(response.body.invites[0]).not.toHaveProperty('code')
    })

    it('creates an invite and returns the link', async () => {
        vi.mocked(inviteRepository.create).mockResolvedValue({ code: 'abc123', expiresAt: 999 } as any)

        const response = await run(createInviteRoute, admin.email, { email: 'New@Gmail.com' })

        expect(inviteRepository.create).toHaveBeenCalledWith({ createdBy: admin.email, email: 'new@gmail.com' })
        expect(response.status).toBe(201)
        expect(response.body).toEqual({ link: 'https://t.me/mostro_bot?start=abc123', expiresAt: 999 })
    })

    it('400s an invalid email without touching the repository', async () => {
        const response = await run(createInviteRoute, admin.email, { email: 'not-an-email' })

        expect(response.status).toBe(400)
        expect(inviteRepository.create).not.toHaveBeenCalled()
    })

    it('409s an email that already redeemed an invite', async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue({ ...admin, telegramId: '42' } as any)

        const response = await run(createInviteRoute, admin.email, { email: 'active@gmail.com' })

        expect(response.status).toBe(409)
        expect(inviteRepository.create).not.toHaveBeenCalled()
    })
})
