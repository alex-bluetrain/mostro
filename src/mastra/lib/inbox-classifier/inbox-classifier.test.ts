import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { InboxClassifier, type InboxClassifierConfig, FAILED_LABEL } from './inbox-classifier'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function buildGmail() {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({
        data: {
            id: 'm1',
            payload: { mimeType: 'text/plain', body: { data: encode('Confirmamos la entrega.') } },
        },
    })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({
        data: { labels: [{ id: 'L1', name: 'clasificado-pedido' }, { id: 'LF', name: FAILED_LABEL }] },
    })
    const labelsCreate = vi.fn().mockResolvedValue({ data: { id: 'L2' } })

    return {
        gmail: {
            users: {
                messages: { list, get, modify },
                labels: { list: labelsList, create: labelsCreate },
            },
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
        { label: 'clasificado-pedido', classification: { description: 'confirma una entrega' } },
        { label: 'clasificado-otro', classification: { description: 'catch-all: cualquier otra cosa' } },
    ],
}

const expectedQuery = 'from:farmacia.test newer_than:30d -label:clasificado-pedido -label:clasificado-otro -label:mostro/failed'

describe('InboxClassifier', () => {
    it('traduce la query agregando las exclusiones de label, lista, lee, clasifica y etiqueta un solo mail', async () => {
        const { gmail, list, get, modify, labelsCreate } = buildGmail()
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-pedido' },
        ])

        const classifier = new InboxClassifier(config, gmail)
        await classifier.init(mastra as never)
        await classifier.run()

        expect(list).toHaveBeenCalledWith({ userId: 'me', q: expectedQuery })
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

        const classifier = new InboxClassifier(config, gmail)
        await classifier.init(mastra as never)
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

        const classifier = new InboxClassifier(config, gmail)
        await classifier.init(mastra as never)
        await classifier.run()

        expect(generate.mock.calls[1][0]).toContain('contenido de viejo')
        expect(generate.mock.calls[2][0]).toContain('contenido de nuevo')
    })

    it('un fallo en un mail no corta el procesamiento del resto, y el mail roto queda etiquetado como mostro/failed', async () => {
        const { gmail, list, get, modify } = buildGmail()
        list.mockResolvedValue({ data: { messages: [{ id: 'm2' }, { id: 'm1' }] } })
        get.mockRejectedValueOnce(new Error('Gmail caído'))
        get.mockResolvedValueOnce({
            data: {
                id: 'm2',
                payload: { mimeType: 'text/plain', body: { data: encode('Confirmamos la entrega.') } },
            },
        })
        const { mastra } = buildMastra([{ query: 'q' }, { label: 'clasificado-pedido' }])
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const classifier = new InboxClassifier(config, gmail)
        await classifier.init(mastra as never)
        await classifier.run()

        expect(error).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.any(Error))
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['LF'] },
        })
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm2',
            requestBody: { addLabelIds: ['L1'] },
        })
        error.mockRestore()
    })

    it('lanza si se llama run() antes de init()', async () => {
        const { gmail } = buildGmail()
        const classifier = new InboxClassifier(config, gmail)

        await expect(classifier.run()).rejects.toThrow('llamá a init()')
    })

    it('un outcome con extract hace una segunda llamada al agente y pasa los datos validados al handler', async () => {
        const { gmail, modify } = buildGmail()
        const extractSchema = z.object({ deliveryDate: z.string() })
        const handle = vi.fn().mockResolvedValue({ ok: true })
        const configWithExtract: InboxClassifierConfig = {
            queryDescription: 'x',
            outcomes: [
                { label: 'clasificado-pedido', classification: { description: 'confirma una entrega' }, extraction: { instructions: 'Extraé la fecha de entrega.', schema: extractSchema }, handle },
                { label: 'clasificado-otro', classification: { description: 'catch-all' } },
            ],
        }
        const { mastra, generate } = buildMastra([
            { query: 'q' },
            { label: 'clasificado-pedido' },
            { deliveryDate: '2026-08-01' },
        ])

        const classifier = new InboxClassifier(configWithExtract, gmail)
        await classifier.init(mastra as never)
        await classifier.run()

        expect(generate).toHaveBeenCalledTimes(3)
        expect(handle).toHaveBeenCalledWith(expect.objectContaining({ data: { deliveryDate: '2026-08-01' } }))
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        })
    })

    it('un outcome sin handle (catch-all) solo etiqueta, no llama a extract ni cuenta como fallo', async () => {
        const { gmail, modify } = buildGmail()
        const { mastra, generate } = buildMastra([
            { query: 'q' },
            { label: 'clasificado-otro' },
        ])
        const labelsList = (gmail as { users: { labels: { list: ReturnType<typeof vi.fn> } } }).users.labels.list
        labelsList.mockResolvedValue({ data: { labels: [{ id: 'L2', name: 'clasificado-otro' }] } })

        const classifier = new InboxClassifier(config, gmail)
        await classifier.init(mastra as never)
        await classifier.run()

        expect(generate).toHaveBeenCalledTimes(2)
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        })
    })

    it('si el handler devuelve ok:false, el mail queda etiquetado como mostro/failed y no con el outcome', async () => {
        const { gmail, modify } = buildGmail()
        const handle = vi.fn().mockResolvedValue({ ok: false, reason: 'not_found' })
        const configWithHandle: InboxClassifierConfig = {
            queryDescription: 'x',
            outcomes: [
                { label: 'clasificado-pedido', classification: { description: 'confirma una entrega' }, handle },
                { label: 'clasificado-otro', classification: { description: 'catch-all' } },
            ],
        }
        const { mastra } = buildMastra([{ query: 'q' }, { label: 'clasificado-pedido' }])

        const classifier = new InboxClassifier(configWithHandle, gmail)
        await classifier.init(mastra as never)
        await classifier.run()

        expect(handle).toHaveBeenCalled()
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['LF'] },
        })
    })

    it('si la extracción no valida contra el schema, el mail queda etiquetado como mostro/failed y no se llama al handler', async () => {
        const { gmail, modify } = buildGmail()
        const extractSchema = z.object({ deliveryDate: z.string() })
        const handle = vi.fn().mockResolvedValue({ ok: true })
        const configWithExtract: InboxClassifierConfig = {
            queryDescription: 'x',
            outcomes: [
                { label: 'clasificado-pedido', classification: { description: 'confirma una entrega' }, extraction: { instructions: 'Extraé la fecha de entrega.', schema: extractSchema }, handle },
                { label: 'clasificado-otro', classification: { description: 'catch-all' } },
            ],
        }
        const { mastra } = buildMastra([
            { query: 'q' },
            { label: 'clasificado-pedido' },
            { deliveryDate: 42 },
        ])
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const classifier = new InboxClassifier(configWithExtract, gmail)
        await classifier.init(mastra as never)
        await classifier.run()

        expect(handle).not.toHaveBeenCalled()
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['LF'] },
        })
        error.mockRestore()
    })

    it('la query final incluye las exclusiones de todos los outcomes más la de mostro/failed', async () => {
        const { gmail } = buildGmail()
        const configWithMore: InboxClassifierConfig = {
            queryDescription: 'x',
            outcomes: [
                { label: 'a', classification: { description: 'a' } },
                { label: 'b', classification: { description: 'b' } },
                { label: 'c', classification: { description: 'c' } },
            ],
        }
        const { mastra } = buildMastra([{ query: 'base query' }])

        const classifier = new InboxClassifier(configWithMore, gmail)
        await classifier.init(mastra as never)

        expect((classifier as unknown as { query: string }).query)
            .toBe('base query -label:a -label:b -label:c -label:mostro/failed')
    })
})
