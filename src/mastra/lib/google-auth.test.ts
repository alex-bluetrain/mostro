import { describe, it, expect, vi, beforeEach } from 'vitest'

const handleCallbackResult = { user: { email: 'stranger@gmail.com', name: 'S' } }

vi.mock('@mastra/auth-google', () => {
    class MastraAuthGoogle {
        handleCallback: (code: string, state: string) => Promise<typeof handleCallbackResult>
        constructor(_options: unknown) {
            this.handleCallback = async () => handleCallbackResult
        }
    }
    return { MastraAuthGoogle }
})

vi.mock('../config/app.config', () => ({
    appConfig: {
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REDIRECT_URI: 'https://example.com/api/auth/sso/callback',
        GOOGLE_COOKIE_PASSWORD: 'x'.repeat(32),
    },
}))

vi.mock('../../business/repositories', () => ({
    userRepository: {
        findByEmail: vi.fn(),
        setUserName: vi.fn(),
    },
}))

import { createGoogleAuth } from './google-auth'
import { userRepository } from '../../business/repositories'

type CallbackAuth = { handleCallback: (code: string, state: string) => Promise<typeof handleCallbackResult> }

describe('createGoogleAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects the login when the google account is unknown', async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue(null)

        const auth = createGoogleAuth() as unknown as CallbackAuth

        await expect(auth.handleCallback('c', 's')).rejects.toThrow(/invite/)
    })

    it('resolves and returns the original result when the google account is known', async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue({ name: 'Ana' } as any)

        const auth = createGoogleAuth() as unknown as CallbackAuth

        await expect(auth.handleCallback('c', 's')).resolves.toEqual(handleCallbackResult)
    })
})
