import { describe, expect, it, vi } from 'vitest'
import {
    buildWelcomeMessage,
    createTelegramStartHandler,
    KNOWN_USER_GREETING,
    INVALID_INVITE_MESSAGE,
    type TelegramStartDeps,
} from '../src/mastra/lib/telegram-start'
import type { IUser, IInvite } from '../src/business'

const member: IUser = { email: 'ana@gmail.com', telegramId: '111', name: 'Ana', role: 'member', addedAt: 1 }
const validInvite: IInvite = { code: 'abc123XYZ_-9', email: 'nueva@gmail.com', name: 'Nueva', createdBy: 'admin@gmail.com', createdAt: 1, expiresAt: 2, usedBy: '222' }

function makeDeps(overrides: Partial<TelegramStartDeps> = {}): TelegramStartDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
        redeemInvite: vi.fn(async () => null),
        linkTelegramId: vi.fn(async () => true),
        ...overrides,
    }
}

function makeEvent(senderId: string, text: string) {
    const post = vi.fn(async () => ({}))
    return { event: { user: { userId: senderId }, text, channel: { post } }, post }
}

describe('buildWelcomeMessage', () => {
    it('con nombre saluda por nombre y no pregunta el nombre', () => {
        const msg = buildWelcomeMessage('Nueva')
        expect(msg).toContain('Nueva')
        expect(msg).not.toContain('¿cómo te llamás?')
    })

    it('sin nombre pregunta el nombre', () => {
        expect(buildWelcomeMessage()).toContain('¿cómo te llamás?')
    })
})

describe('createTelegramStartHandler', () => {
    it('usuario conocido recibe saludo de regreso sin canjear nada', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const { event, post } = makeEvent('111', '')
        await createTelegramStartHandler(deps)(event)
        expect(post).toHaveBeenCalledExactlyOnceWith(KNOWN_USER_GREETING)
        expect(deps.redeemInvite).not.toHaveBeenCalled()
    })

    it('desconocido con código válido canjea, linkea y recibe la bienvenida', async () => {
        const deps = makeDeps({ redeemInvite: vi.fn(async () => validInvite) })
        const { event, post } = makeEvent('222', 'abc123XYZ_-9')
        await createTelegramStartHandler(deps)(event)
        expect(deps.redeemInvite).toHaveBeenCalledWith('abc123XYZ_-9', '222')
        expect(deps.linkTelegramId).toHaveBeenCalledWith('nueva@gmail.com', '222')
        expect(post).toHaveBeenCalledExactlyOnceWith(buildWelcomeMessage('Nueva'))
    })

    it('desconocido con código inválido/vencido/usado recibe el mensaje genérico', async () => {
        const deps = makeDeps()
        const { event, post } = makeEvent('222', 'abc123XYZ_-9')
        await createTelegramStartHandler(deps)(event)
        expect(deps.linkTelegramId).not.toHaveBeenCalled()
        expect(post).toHaveBeenCalledExactlyOnceWith(INVALID_INVITE_MESSAGE)
    })

    it('desconocido sin código recibe el mensaje genérico sin intentar canje', async () => {
        const deps = makeDeps()
        const { event, post } = makeEvent('222', '   ')
        await createTelegramStartHandler(deps)(event)
        expect(deps.redeemInvite).not.toHaveBeenCalled()
        expect(post).toHaveBeenCalledExactlyOnceWith(INVALID_INVITE_MESSAGE)
    })

    it('canje válido pero sin user destinatario recibe el mensaje genérico', async () => {
        const deps = makeDeps({
            redeemInvite: vi.fn(async () => validInvite),
            linkTelegramId: vi.fn(async () => false),
        })
        const { event, post } = makeEvent('222', 'abc123XYZ_-9')
        await createTelegramStartHandler(deps)(event)
        expect(post).toHaveBeenCalledExactlyOnceWith(INVALID_INVITE_MESSAGE)
    })

    it('un error de las deps no revienta el handler', async () => {
        const deps = makeDeps({
            getUserByTelegramId: vi.fn(async () => {
                throw new Error('mongo down')
            }),
        })
        const { event } = makeEvent('222', 'abc123XYZ_-9')
        await expect(createTelegramStartHandler(deps)(event)).resolves.toBeUndefined()
    })
})
