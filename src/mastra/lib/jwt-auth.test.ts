import { beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 's'.repeat(32)
const config: Record<string, string | undefined> = { MOSTRO_JWT_SECRET: SECRET }

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('@lib/app-logger', () => ({ appLogger: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('./invite-gate', () => ({ assertInvitedAndSyncName: vi.fn() }))

const { assertInvitedAndSyncName } = await import('./invite-gate')
const { createJwtAuth } = await import('./jwt-auth')

describe('createJwtAuth', () => {
    beforeEach(() => {
        config.MOSTRO_JWT_SECRET = SECRET
        vi.mocked(assertInvitedAndSyncName).mockReset().mockResolvedValue(undefined)
    })

    it('sin secret no crea el provider', () => {
        config.MOSTRO_JWT_SECRET = undefined
        expect(createJwtAuth()).toBeUndefined()
    })

    it('autoriza al email invitado', async () => {
        const auth = createJwtAuth()!
        await expect(auth.authorizeUser({ email: 'ana@gmail.com' } as any)).resolves.toBe(true)
        expect(assertInvitedAndSyncName).toHaveBeenCalledWith({ email: 'ana@gmail.com', name: undefined })
    })

    // Firma valida no alcanza: mostro-web le da sesion a cualquier cuenta de
    // Google, asi que el allowlist tiene que cortar aca.
    it('rechaza un token bien firmado de un email desconocido', async () => {
        vi.mocked(assertInvitedAndSyncName).mockRejectedValue(new Error('invite-only'))
        const auth = createJwtAuth()!
        await expect(auth.authorizeUser({ email: 'stranger@gmail.com' } as any)).resolves.toBe(false)
    })

    it('rechaza un token sin email', async () => {
        const auth = createJwtAuth()!
        await expect(auth.authorizeUser({ sub: 'x' } as any)).resolves.toBe(false)
        expect(assertInvitedAndSyncName).not.toHaveBeenCalled()
    })

    it('mapea la memoria al email, igual que telegram', () => {
        const auth = createJwtAuth()!
        expect(auth.mapUserToResourceId?.({ email: 'ana@gmail.com' } as any)).toBe('ana@gmail.com')
    })
})
