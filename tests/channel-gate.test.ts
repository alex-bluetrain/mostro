import { describe, expect, it, vi } from 'vitest'
import { createChannelGate, type ChannelGateDeps } from '@lib/channel-gate'
import type { IUser } from '@business'

const member: IUser = { email: 'ana@gmail.com', telegramId: '111', discordId: '999999999999999999', name: 'Ana', role: 'member', addedAt: 1, preferences: { notifications: false } }

function makeDeps(overrides: Partial<ChannelGateDeps> = {}): ChannelGateDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
        getUserByDiscordId: vi.fn(async () => null),
        ...overrides,
    }
}

function makeMessage(senderId: string, text: string) {
    return { author: { userId: senderId }, text } as any
}

function makeThread(platform: string) {
    return { adapter: { name: platform } } as any
}

const ctx = { requestContext: {} } as any

describe('createChannelGate', () => {
    it('usuario registrado pasa al defaultHandler', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        const message = makeMessage('111', 'hola')
        const thread = makeThread('telegram')
        await createChannelGate(deps)(thread, message, defaultHandler, ctx)
        expect(defaultHandler).toHaveBeenCalledExactlyOnceWith(thread, message)
    })

    it('desconocido es ignorado en silencio', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('telegram'), makeMessage('222', 'hola'), defaultHandler, ctx)
        expect(defaultHandler).not.toHaveBeenCalled()
    })

    it('resuelve por discordId cuando el mensaje llega por discord', async () => {
        const getUserByDiscordId = vi.fn(async () => member)
        const deps = makeDeps({ getUserByDiscordId })
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('discord'), makeMessage('999999999999999999', 'hola'), defaultHandler, ctx)
        expect(getUserByDiscordId).toHaveBeenCalledWith('999999999999999999')
        expect(deps.getUserByTelegramId).not.toHaveBeenCalled()
        expect(defaultHandler).toHaveBeenCalledOnce()
    })

    // Un telegramId válido no debe abrir la puerta en Discord: son espacios de
    // ids distintos y cruzarlos dejaría entrar a cualquiera con el número.
    it('no cruza identidades entre plataformas', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('discord'), makeMessage('111', 'hola'), defaultHandler, ctx)
        expect(defaultHandler).not.toHaveBeenCalled()
    })

    it('rechaza plataformas sin identidad mapeada', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        await createChannelGate(deps)(makeThread('slack'), makeMessage('111', 'hola'), defaultHandler, ctx)
        expect(defaultHandler).not.toHaveBeenCalled()
    })
})
