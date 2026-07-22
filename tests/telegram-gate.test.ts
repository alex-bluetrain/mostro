import { describe, expect, it, vi } from 'vitest'
import { createTelegramGate, type TelegramGateDeps } from '../src/mastra/lib/telegram-gate'
import type { IUser } from '../src/business'

const member: IUser = { email: 'ana@gmail.com', telegramId: '111', name: 'Ana', role: 'member', addedAt: 1 }

function makeDeps(overrides: Partial<TelegramGateDeps> = {}): TelegramGateDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
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
        expect(defaultHandler).toHaveBeenCalledExactlyOnceWith(thread, message)
    })

    it('desconocido es ignorado en silencio', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', 'hola'), defaultHandler)
        expect(defaultHandler).not.toHaveBeenCalled()
    })
})
