import { describe, expect, it, vi } from 'vitest'
import { createTelegramGate, parseStartCode, type TelegramGateDeps } from '../src/mastra/lib/telegram-gate'
import type { User } from '../src/mastra/lib/users'
import type { Invite } from '../src/mastra/lib/invites'

describe('parseStartCode', () => {
    it('extrae el código de /start CODE', () => {
        expect(parseStartCode('/start abc123XYZ_-9')).toBe('abc123XYZ_-9')
    })

    it('tolera espacios alrededor', () => {
        expect(parseStartCode('  /start abc123XYZ_-9  ')).toBe('abc123XYZ_-9')
    })

    it('rechaza /start sin código', () => {
        expect(parseStartCode('/start')).toBeNull()
    })

    it('rechaza códigos con caracteres no URL-safe', () => {
        expect(parseStartCode('/start abc$123')).toBeNull()
    })

    it('rechaza texto común', () => {
        expect(parseStartCode('hola, quiero pañales')).toBeNull()
    })

    it('rechaza undefined', () => {
        expect(parseStartCode(undefined)).toBeNull()
    })
})

const member: User = { email: 'ana@gmail.com', telegramId: '111', name: 'Ana', role: 'member', addedAt: 1 }
const validInvite: Invite = { code: 'abc123XYZ_-9', email: 'nueva@gmail.com', createdBy: 'admin@gmail.com', createdAt: 1, expiresAt: 2, usedBy: '222' }

function makeDeps(overrides: Partial<TelegramGateDeps> = {}): TelegramGateDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
        redeemInvite: vi.fn(async () => null),
        linkTelegramId: vi.fn(async () => true),
        ...overrides,
    }
}

function makeMessage(senderId: string, text: string) {
    return { author: { userId: senderId }, text } as any
}

const thread = {} as any

describe('createTelegramGate', () => {
    it('usuario registrado pasa al defaultHandler', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        const message = makeMessage('111', 'hola')
        await createTelegramGate(deps)(thread, message, defaultHandler)
        expect(defaultHandler).toHaveBeenCalledOnce()
        expect(defaultHandler).toHaveBeenCalledWith(thread, message)
        expect(deps.redeemInvite).not.toHaveBeenCalled()
    })

    it('desconocido con texto común es ignorado en silencio', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', 'hola'), defaultHandler)
        expect(defaultHandler).not.toHaveBeenCalled()
        expect(deps.redeemInvite).not.toHaveBeenCalled()
        expect(deps.linkTelegramId).not.toHaveBeenCalled()
    })

    it('desconocido con código válido queda registrado como member y pasa al agente', async () => {
        const deps = makeDeps({ redeemInvite: vi.fn(async () => validInvite) })
        const defaultHandler = vi.fn(async () => {})
        const message = makeMessage('222', '/start abc123XYZ_-9')
        await createTelegramGate(deps)(thread, message, defaultHandler)
        expect(deps.redeemInvite).toHaveBeenCalledWith('abc123XYZ_-9', '222')
        expect(deps.linkTelegramId).toHaveBeenCalledWith('nueva@gmail.com', '222')
        expect(defaultHandler).toHaveBeenCalledOnce()
        expect(defaultHandler).toHaveBeenCalledWith(thread, message)
    })

    it('desconocido con código inválido/vencido/usado es ignorado (redeem devuelve null)', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', '/start abc123XYZ_-9'), defaultHandler)
        expect(deps.linkTelegramId).not.toHaveBeenCalled()
        expect(defaultHandler).not.toHaveBeenCalled()
    })

    it('canje válido pero sin user destinatario no pasa al agente', async () => {
        const deps = makeDeps({
            redeemInvite: vi.fn(async () => validInvite),
            linkTelegramId: vi.fn(async () => false),
        })
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', '/start abc123XYZ_-9'), defaultHandler)
        expect(defaultHandler).not.toHaveBeenCalled()
    })

    it('registrado que manda /start va por flujo normal sin canjear', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        const message = makeMessage('111', '/start abc123XYZ_-9')
        await createTelegramGate(deps)(thread, message, defaultHandler)
        expect(defaultHandler).toHaveBeenCalledOnce()
        expect(defaultHandler).toHaveBeenCalledWith(thread, message)
        expect(deps.redeemInvite).not.toHaveBeenCalled()
    })
})
