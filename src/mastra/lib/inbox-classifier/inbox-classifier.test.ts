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

    it('crea el label cuando no existe todavía', async () => {
        const { gmail, labelsList, labelsCreate, modify } = buildGmail()
        labelsList.mockResolvedValue({ data: { labels: [] } })
        const { mastra } = buildMastra([
            { query: 'from:farmacia.test' },
            { label: 'clasificado-pedido' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(labelsCreate).toHaveBeenCalledWith({
            userId: 'me',
            requestBody: { name: 'clasificado-pedido', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        })
    })

    it('procesa los mails de más viejo a más nuevo (list devuelve más nuevo primero)', async () => {
        const { gmail, list, get } = buildGmail()
        list.mockResolvedValue({ data: { messages: [{ id: 'nuevo' }, { id: 'viejo' }] } })
        get.mockImplementation(async ({ id }: { id: string }) => ({
            data: { id, payload: { mimeType: 'text/plain', body: { data: encode(`contenido de ${id}`) } } },
        }))
        const { mastra, generate } = buildMastra([
            { query: 'q' },
            { label: 'clasificado-pedido' },
            { label: 'clasificado-pedido' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(generate.mock.calls[1][0]).toContain('contenido de viejo')
        expect(generate.mock.calls[2][0]).toContain('contenido de nuevo')
    })

    it('un fallo en un mail no corta el procesamiento del resto', async () => {
        const { gmail, get, modify } = buildGmail()
        get.mockRejectedValueOnce(new Error('Gmail caído'))
        const { mastra } = buildMastra([{ query: 'q' }])
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.any(Error))
        expect(modify).not.toHaveBeenCalled()
        warn.mockRestore()
    })

    it('lanza si se llama run() antes de init()', async () => {
        const { gmail } = buildGmail()
        const { mastra } = buildMastra([])

        const classifier = new InboxClassifier(mastra as never, config, gmail)

        await expect(classifier.run()).rejects.toThrow('llamá a init()')
    })
})
