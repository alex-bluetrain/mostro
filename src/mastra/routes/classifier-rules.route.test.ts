import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@business/identity', () => ({
    getUserByResourceId: vi.fn(),
}))
vi.mock('@business/repositories', () => ({
    classifierRepository: {
        listActiveVersions: vi.fn(),
        listSnapshots: vi.fn(),
        findSnapshot: vi.fn(),
        publishSnapshot: vi.fn(),
        activateVersion: vi.fn(),
    },
}))

import {
    listClassifierRulesRoute,
    getClassifierSnapshotRoute,
    publishClassifierSnapshotRoute,
    activateClassifierVersionRoute,
} from './classifier-rules.route'
import { getUserByResourceId } from '@business/identity'
import { classifierRepository } from '@business/repositories'
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'

type Response = { body: any; status?: number }

function run(
    route: unknown,
    opts: { resourceId?: string; params?: Record<string, string>; body?: unknown } = {},
): Promise<Response> {
    const c = {
        get: (key: string) =>
            key === 'requestContext'
                ? { get: (k: string) => (k === MASTRA_RESOURCE_ID_KEY ? opts.resourceId : undefined) }
                : undefined,
        req: {
            param: (name: string) => opts.params?.[name],
            json: async () => opts.body,
        },
        json: (b: unknown, status?: number) => ({ body: b, status }),
    }
    return (route as { handler: (c: unknown) => Promise<Response> }).handler(c)
}

const admin = { email: 'admin@gmail.com', name: 'Admin', role: 'admin', addedAt: 1, preferences: { notifications: false } }
const rules = {
    outcomes: [{ label: 'diapers.confirmed', condition: 'confirma el pedido' }],
    'default-outcome': { label: 'diapers.unknown' },
}

describe('classifier rules routes', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getUserByResourceId).mockResolvedValue(admin as any)
        vi.mocked(classifierRepository.listActiveVersions).mockResolvedValue({ diapers: 2 })
        vi.mocked(classifierRepository.listSnapshots).mockResolvedValue([])
    })

    it('403s a member on every route: the role gate is here, not in the UI', async () => {
        vi.mocked(getUserByResourceId).mockResolvedValue({ ...admin, role: 'member' } as any)
        const as = { resourceId: 'member@gmail.com', params: { domain: 'diapers', version: '1' }, body: { rules, changelog: 'x', version: 1 } }

        const responses = await Promise.all([
            run(listClassifierRulesRoute, as),
            run(getClassifierSnapshotRoute, as),
            run(publishClassifierSnapshotRoute, as),
            run(activateClassifierVersionRoute, as),
        ])

        expect(responses.map(r => r.status)).toEqual([403, 403, 403, 403])
        expect(classifierRepository.publishSnapshot).not.toHaveBeenCalled()
        expect(classifierRepository.activateVersion).not.toHaveBeenCalled()
    })

    it('lists the three domains with their active pointer', async () => {
        vi.mocked(classifierRepository.listSnapshots).mockResolvedValue([
            { domain: 'diapers', version: 2, author: 'Alex', changelog: 'ajuste' } as any,
        ])

        const response = await run(listClassifierRulesRoute, { resourceId: admin.email })

        expect(response.body.domains.map((d: any) => d.domain)).toEqual(['diapers', 'meds', 'refunds'])
        expect(response.body.domains[0].activeVersion).toBe(2)
        // Sin puntero el dominio existe igual: "no configurado" es un estado, no un error.
        expect(response.body.domains[1].activeVersion).toBeNull()
    })

    it('returns a snapshot with its rules and whether it is active', async () => {
        vi.mocked(classifierRepository.findSnapshot).mockResolvedValue({
            domain: 'diapers', version: 2, author: 'Alex', changelog: 'ajuste', classification_rules: rules,
        } as any)

        const response = await run(getClassifierSnapshotRoute, { resourceId: admin.email, params: { domain: 'diapers', version: '2' } })

        expect(response.body).toMatchObject({ version: 2, rules, isActive: true })
    })

    it('404s a version that does not exist and 400s a bogus domain', async () => {
        vi.mocked(classifierRepository.findSnapshot).mockResolvedValue(null)

        const missing = await run(getClassifierSnapshotRoute, { resourceId: admin.email, params: { domain: 'diapers', version: '9' } })
        const bogus = await run(getClassifierSnapshotRoute, { resourceId: admin.email, params: { domain: 'pizza', version: '1' } })

        expect(missing.status).toBe(404)
        expect(bogus.status).toBe(400)
    })

    it('publishes a new version signing it with the caller, not the body', async () => {
        vi.mocked(classifierRepository.publishSnapshot).mockResolvedValue(3)

        const response = await run(publishClassifierSnapshotRoute, {
            resourceId: admin.email,
            params: { domain: 'diapers' },
            body: { rules, changelog: 'agrego outcome', author: 'impostor' },
        })

        expect(classifierRepository.publishSnapshot).toHaveBeenCalledWith({
            domain: 'diapers', author: 'Admin', changelog: 'agrego outcome', rules,
        })
        expect(response.status).toBe(201)
        expect(response.body).toEqual({ domain: 'diapers', version: 3 })
    })

    it('400s malformed rules or a missing changelog before touching Mongo', async () => {
        const noChangelog = await run(publishClassifierSnapshotRoute, {
            resourceId: admin.email, params: { domain: 'diapers' }, body: { rules, changelog: '  ' },
        })
        const badRules = await run(publishClassifierSnapshotRoute, {
            resourceId: admin.email, params: { domain: 'diapers' }, body: { rules: { outcomes: [] }, changelog: 'x' },
        })

        expect(noChangelog.status).toBe(400)
        expect(badRules.status).toBe(400)
        expect(classifierRepository.publishSnapshot).not.toHaveBeenCalled()
    })

    it('moves the active pointer, and 404s if that version was never published', async () => {
        vi.mocked(classifierRepository.activateVersion).mockResolvedValueOnce(true).mockResolvedValueOnce(false)

        const ok = await run(activateClassifierVersionRoute, { resourceId: admin.email, params: { domain: 'meds' }, body: { version: 1 } })
        const missing = await run(activateClassifierVersionRoute, { resourceId: admin.email, params: { domain: 'meds' }, body: { version: 99 } })

        expect(ok.body).toEqual({ domain: 'meds', activeVersion: 1 })
        expect(missing.status).toBe(404)
    })
})
