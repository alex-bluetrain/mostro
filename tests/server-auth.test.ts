import { beforeEach, describe, expect, it, vi } from 'vitest'

const config: Record<string, string | undefined> = { STUDIO_API_KEY: 'k'.repeat(32) }

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('@lib/google-auth', () => ({
    createGoogleAuth: () => 'google-auth',
    TELEGRAM_CHANNEL_WEBHOOK: /^\/telegram$/,
}))

const { createServerAuth } = await import('@lib/server-auth')

describe('createServerAuth', () => {
    beforeEach(() => {
        config.STUDIO_API_KEY = 'k'.repeat(32)
    })

    it('con STUDIO_API_KEY usa SimpleAuth, exento del gate de licencia EE', () => {
        const auth = createServerAuth() as any
        expect(auth.isSimpleAuth).toBe(true)
    })

    it('sin STUDIO_API_KEY cae a Google SSO', () => {
        config.STUDIO_API_KEY = undefined
        expect(createServerAuth()).toBe('google-auth')
    })
})
