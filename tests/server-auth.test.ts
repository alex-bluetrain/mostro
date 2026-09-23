import { beforeEach, describe, expect, it, vi } from 'vitest'

const config: Record<string, string | undefined> = {
    STUDIO_API_KEY: 'k'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id',
}

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('@lib/app-logger', () => ({ appLogger: { info: vi.fn(), warn: vi.fn() } }))

const { createServerAuth } = await import('@lib/server-auth')

describe('createServerAuth', () => {
    beforeEach(() => {
        config.STUDIO_API_KEY = 'k'.repeat(32)
        config.GOOGLE_CLIENT_ID = 'client-id'
    })

    it('con ambos secrets combina google y studio auth', () => {
        const auth = createServerAuth() as any
        expect(auth.constructor.name).toBe('CompositeAuth')
        // El webhook de Telegram debe seguir publico: CompositeAuth une los
        // `public` de todos los providers, y si se pierde el bot deja de andar.
        expect(auth.public).toHaveLength(2)
    })

    it('solo con STUDIO_API_KEY usa SimpleAuth, exento del gate de licencia EE', () => {
        config.GOOGLE_CLIENT_ID = undefined
        const auth = createServerAuth() as any
        expect(auth.isSimpleAuth).toBe(true)
    })

    it('sin ningun secret falla en el boot en vez de dejar el server abierto', () => {
        config.STUDIO_API_KEY = undefined
        config.GOOGLE_CLIENT_ID = undefined
        expect(() => createServerAuth()).toThrow(/no auth provider/)
    })
})
