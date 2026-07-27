import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../business/repositories', () => ({
    subscriberRepository: { list: vi.fn() },
}))
vi.mock('../resolve-telegram-thread', () => ({
    resolveTelegramThread: vi.fn(),
}))

import { subscriberRepository } from '../../../business/repositories'
import { resolveTelegramThread } from '../resolve-telegram-thread'
import { notifyMailFailure } from './notify-mail-failure'

const failure = {
    domain: 'diapers' as const,
    from: 'pedidos@farmacia.test',
    subject: 'Cierre por vacaciones',
    reason: 'no es una confirmación de pedido',
}

function buildMastra() {
    const sendNotificationSignal = vi.fn().mockResolvedValue(undefined)
    const mastra = { getAgent: vi.fn().mockReturnValue({ sendNotificationSignal }) }
    return { mastra, sendNotificationSignal }
}

beforeEach(() => {
    vi.mocked(subscriberRepository.list).mockResolvedValue(['ana@gmail.com', 'beto@gmail.com'])
    vi.mocked(resolveTelegramThread).mockResolvedValue({ resourceId: 'x', threadId: 't1' })
})

describe('notifyMailFailure', () => {
    it('avisa a todos los suscriptores del dominio', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        const sent = await notifyMailFailure(mastra as never, failure)

        expect(subscriberRepository.list).toHaveBeenCalledWith('diapers')
        expect(sent).toBe(2)
        expect(sendNotificationSignal).toHaveBeenCalledTimes(2)
    })

    it('encuadra el aviso como mensaje del sistema para que el supervisor lo reenvíe', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        await notifyMailFailure(mastra as never, failure)

        const [signal] = sendNotificationSignal.mock.calls[0]
        expect(signal.summary).toContain('[AVISO DEL SISTEMA')
        expect(signal.summary).toContain('Reenviá este aviso tal cual')
    })

    it('incluye remitente, asunto y motivo en el aviso', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        await notifyMailFailure(mastra as never, failure)

        const [signal] = sendNotificationSignal.mock.calls[0]
        expect(signal.summary).toContain('pedidos@farmacia.test')
        expect(signal.summary).toContain('Cierre por vacaciones')
        expect(signal.summary).toContain('no es una confirmación de pedido')
    })

    it('aclara que solo un admin puede reintentar', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        await notifyMailFailure(mastra as never, failure)

        const [signal] = sendNotificationSignal.mock.calls[0]
        expect(signal.summary).toContain('admin')
    })

    it('saltea a los suscriptores sin thread de telegram', async () => {
        vi.mocked(resolveTelegramThread).mockResolvedValueOnce(null)
        const { mastra, sendNotificationSignal } = buildMastra()

        const sent = await notifyMailFailure(mastra as never, failure)

        expect(sent).toBe(1)
        expect(sendNotificationSignal).toHaveBeenCalledTimes(1)
    })

    // getAgent lanza cuando la clave no está registrada, no devuelve undefined.
    // Este es el caso que de verdad ocurre en producción.
    it('no falla cuando getAgent lanza porque el supervisor no está registrado', async () => {
        const mastra = {
            getAgent: vi.fn().mockImplementation(() => {
                throw new Error('Agent with name mostroSupervisor not found')
            }),
        }

        const sent = await notifyMailFailure(mastra as never, failure)

        expect(sent).toBe(0)
    })

    it('no falla cuando no hay instancia de mastra', async () => {
        const sent = await notifyMailFailure(undefined, failure)

        expect(sent).toBe(0)
    })
})
