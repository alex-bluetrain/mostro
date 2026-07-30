import { describe, it, expect, vi } from 'vitest'
import { search, addLabel, removeLabel } from './gmail-reader'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function buildClient(overrides: Record<string, unknown> = {}) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({
        data: {
            id: 'm1',
            internalDate: '1785000000000',
            payload: {
                headers: [
                    { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                    { name: 'Subject', value: 'Confirmación de pedido' },
                ],
                mimeType: 'text/plain',
                body: { data: encode('Entregamos el 11/03.') },
            },
        },
    })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({ data: { labels: [{ id: 'L1', name: 'mostro-processed' }] } })
    const labelsCreate = vi.fn().mockResolvedValue({ data: { id: 'L2' } })

    return {
        client: {
            users: {
                messages: { list, get, modify },
                labels: { list: labelsList, create: labelsCreate },
            },
            ...overrides,
        } as never,
        list, get, modify, labelsList, labelsCreate,
    }
}

describe('search', () => {
    it('devuelve remitente, asunto y cuerpo decodificado', async () => {
        const { client } = buildClient()

        const messages = await search('from:pedidos@farmacia.test', client)

        expect(messages).toEqual([{
            id: 'm1',
            from: 'pedidos@farmacia.test',
            subject: 'Confirmación de pedido',
            body: 'Entregamos el 11/03.',
            receivedAt: new Date(1785000000000),
            headers: [
                { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                { name: 'Subject', value: 'Confirmación de pedido' },
            ],
        }])
    })

    it('devuelve lista vacía cuando no hay mails', async () => {
        const { client, list } = buildClient()
        list.mockResolvedValue({ data: {} })

        const messages = await search('from:nadie@test', client)

        expect(messages).toEqual([])
    })

    it('mapea correctamente varios ids a sus mensajes correspondientes', async () => {
        const { client, list, get } = buildClient()
        list.mockResolvedValue({ data: { messages: [{ id: 'mail1' }, { id: 'mail2' }] } })
        get.mockImplementation(async ({ id }: { id: string }) => ({
            data: {
                id,
                internalDate: '1785000000000',
                payload: {
                    headers: [{ name: 'From', value: 'a@b.test' }, { name: 'Subject', value: 's' }],
                    mimeType: 'text/plain',
                    body: { data: encode(id === 'mail1' ? 'contenido del primer mail' : 'contenido del segundo mail') },
                },
            },
        }))

        const messages = await search('q', client)

        expect(messages).toHaveLength(2)
        expect(messages.find(m => m.id === 'mail1')?.body).toBe('contenido del primer mail')
        expect(messages.find(m => m.id === 'mail2')?.body).toBe('contenido del segundo mail')
    })

})

describe('addLabel', () => {
    it('reutiliza el label existente', async () => {
        const { client, modify, labelsCreate } = buildClient()

        await addLabel('m1', 'mostro-processed', client)

        expect(labelsCreate).not.toHaveBeenCalled()
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        }, { timeout: 15000 })
    })

    it('crea el label cuando no existe', async () => {
        const { client, modify, labelsCreate } = buildClient()

        await addLabel('m1', 'mostro-failed', client)

        expect(labelsCreate).toHaveBeenCalledWith({
            userId: 'me',
            requestBody: { name: 'mostro-failed', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        }, { timeout: 15000 })
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        }, { timeout: 15000 })
    })

    it('lanza cuando Gmail crea el label sin id', async () => {
        const { client, labelsCreate } = buildClient()
        labelsCreate.mockResolvedValueOnce({ data: {} })

        await expect(addLabel('m1', 'mostro-failed', client))
            .rejects.toThrow('no devolvió su id')
    })
})

describe('removeLabel', () => {
    it('quita el label del mensaje', async () => {
        const { client, modify } = buildClient()

        await removeLabel('m1', 'mostro-processed', client)

        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { removeLabelIds: ['L1'] },
        }, { timeout: 15000 })
    })
})

describe('timeout y reintento en Gmail', () => {
    it('pasa timeout a messages.list y a messages.get', async () => {
        const { client, list, get } = buildClient()

        await search('from:pedidos@farmacia.test', client)

        expect(list.mock.calls[0][1]).toEqual({ timeout: 15000 })
        expect(get.mock.calls[0][1]).toEqual({ timeout: 15000 })
    })

    it('reintenta messages.list ante un fallo transitorio y termina devolviendo los mails', async () => {
        vi.useFakeTimers()
        const { client, list } = buildClient()
        list.mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
        list.mockResolvedValueOnce({ data: { messages: [{ id: 'm1' }] } })

        const pending = search('q', client)
        await vi.advanceTimersByTimeAsync(5000)
        const messages = await pending

        expect(list).toHaveBeenCalledTimes(2)
        expect(messages).toHaveLength(1)
        vi.useRealTimers()
    })

    it('reintenta modify ante un fallo transitorio y termina etiquetando', async () => {
        vi.useFakeTimers()
        const { client, modify } = buildClient()
        modify.mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
        modify.mockResolvedValueOnce({})

        const pending = addLabel('m1', 'mostro-processed', client)
        await vi.advanceTimersByTimeAsync(5000)
        await pending

        expect(modify).toHaveBeenCalledTimes(2)
        vi.useRealTimers()
    })

    it('reintenta labels.list ante un fallo transitorio antes de resolver el label', async () => {
        vi.useFakeTimers()
        const { client, modify, labelsList } = buildClient()
        labelsList.mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))

        const pending = addLabel('m1', 'mostro-processed', client)
        await vi.advanceTimersByTimeAsync(5000)
        await pending

        expect(labelsList).toHaveBeenCalledTimes(2)
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        }, { timeout: 15000 })
        vi.useRealTimers()
    })

    it('no reintenta labels.create: crear no es idempotente', async () => {
        const { client, labelsList, labelsCreate } = buildClient()
        labelsList.mockResolvedValue({ data: { labels: [] } })
        labelsCreate.mockRejectedValue(Object.assign(new Error('503'), { status: 503 }))

        await expect(addLabel('m1', 'mostro-failed', client)).rejects.toThrow('503')

        expect(labelsCreate).toHaveBeenCalledTimes(1)
    })

    it('no reintenta modify ante un error no retriable', async () => {
        const { client, modify } = buildClient()
        modify.mockRejectedValue(Object.assign(new Error('rechazado'), { status: 403 }))

        await expect(addLabel('m1', 'mostro-processed', client)).rejects.toThrow('rechazado')

        expect(modify).toHaveBeenCalledTimes(1)
    })
})
