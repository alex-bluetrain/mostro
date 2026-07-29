import { describe, it, expect, vi } from 'vitest'
import { InboxClassifier, type InboxClassifierConfig } from './inbox-classifier'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function buildGmail(overrides: Record<string, unknown> = {}) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({
        data: {
            id: 'm1',
            payload: { mimeType: 'text/plain', body: { data: encode('Confirmamos la entrega.') } },
        },
    })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({ data: { labels: [{ id: 'L1', name: 'clasificado-pedido' }] } })
    const labelsCreate = vi.fn().mockResolvedValue({ data: { id: 'L2' } })

    return {
        gmail: {
            users: {
                messages: { list, get, modify },
                labels: { list: labelsList, create: labelsCreate },
            },
            ...overrides,
        } as never,
        list, get, modify, labelsList, labelsCreate,
    }
}

function buildMastra(responses: unknown[]) {
    const generate = vi.fn()
    responses.forEach(object => generate.mockResolvedValueOnce({ object }))
    const mastra = { getAgent: vi.fn().mockReturnValue({ generate }) }
    return { mastra, generate }
}

const config: InboxClassifierConfig = {
    queryDescription: 'mails de proveedores de farmacia de los últimos 30 días',
    outcomes: [
        { label: 'clasificado-pedido', description: 'confirma una entrega' },
        { label: 'clasificado-otro', description: 'catch-all: cualquier otra cosa' },
    ],
}

describe('InboxClassifier', () => {
    it('traduce la query, lista, lee, clasifica y etiqueta un solo mail', async () => {
        const { gmail, list, get, modify, labelsList, labelsCreate } = buildGmail()
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-pedido' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(list).toHaveBeenCalledWith({ userId: 'me', q: 'from:farmacia.test newer_than:30d' })
        expect(get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'full' })
        expect(generate).toHaveBeenNthCalledWith(2, expect.stringContaining('Confirmamos la entrega.'), expect.anything())
        expect(labelsCreate).not.toHaveBeenCalled()
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        })
    })
})
