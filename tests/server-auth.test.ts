import { beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 's'.repeat(32)
const config: Record<string, string | undefined> = {
    STUDIO_API_KEY: 'k'.repeat(32),
    MOSTRO_JWT_SECRET: SECRET,
}

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('@lib/app-logger', () => ({ appLogger: { info: vi.fn(), warn: vi.fn() } }))

const { createServerAuth } = await import('@lib/server-auth')

describe('createServerAuth', () => {
    beforeEach(() => {
        config.STUDIO_API_KEY = 'k'.repeat(32)
        config.MOSTRO_JWT_SECRET = SECRET
    })

    it('con ambos secrets combina jwt y studio auth', () => {
        const auth = createServerAuth() as any
        expect(auth.constructor.name).toBe('CompositeAuth')
        // El webhook de Telegram debe seguir publico: CompositeAuth une los
        // `public` de todos los providers, y si se pierde el bot deja de andar.
        expect(auth.public).toHaveLength(2)
    })

    it('solo con STUDIO_API_KEY usa SimpleAuth, exento del gate de licencia EE', () => {
        config.MOSTRO_JWT_SECRET = undefined
        const auth = createServerAuth() as any
        expect(auth.isSimpleAuth).toBe(true)
    })

    it('solo con MOSTRO_JWT_SECRET usa el provider jwt', () => {
        config.STUDIO_API_KEY = undefined
        const auth = createServerAuth() as any
        expect(auth.name).toBe('jwt')
    })

    it('sin ningun secret falla en el boot en vez de dejar el server abierto', () => {
        config.STUDIO_API_KEY = undefined
        config.MOSTRO_JWT_SECRET = undefined
        expect(() => createServerAuth()).toThrow(/no auth provider/)
    })
})
