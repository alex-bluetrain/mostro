import { describe, it, expect, vi } from 'vitest'
import { createGmailReader } from './gmail-reader'

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

describe('createGmailReader().search', () => {
    it('devuelve remitente, asunto y cuerpo decodificado', async () => {
        const { client } = buildClient()
        const reader = createGmailReader(client)

        const messages = await reader.search('from:pedidos@farmacia.test')

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

    it('expone los headers del nodo raíz, sin nulls', async () => {
        const { client, get } = buildClient()
        get.mockResolvedValue({
            data: {
                id: 'm1',
                internalDate: '1785000000000',
                payload: {
                    headers: [
                        { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                        { name: 'Subject', value: 'Confirmación de pedido' },
                        { name: 'X-Malformed', value: null },
                        { name: null, value: 'sin-nombre' },
                    ],
                    mimeType: 'text/plain',
                    body: { data: encode('Entregamos el 11/03.') },
                },
            },
        })

        const [message] = await createGmailReader(client).search('q')

        expect(message.headers).toEqual([
            { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
            { name: 'Subject', value: 'Confirmación de pedido' },
        ])
    })

    it('devuelve lista vacía cuando no hay mails', async () => {
        const { client, list } = buildClient()
        list.mockResolvedValue({ data: {} })

        const messages = await createGmailReader(client).search('from:nadie@test')

        expect(messages).toEqual([])
    })

    it('extrae el cuerpo de la parte text/plain cuando el mail es multipart', async () => {
        const { client, get } = buildClient()
        get.mockResolvedValue({
            data: {
                id: 'm1',
                internalDate: '1785000000000',
                payload: {
                    headers: [{ name: 'From', value: 'a@b.test' }, { name: 'Subject', value: 'x' }],
                    mimeType: 'multipart/alternative',
                    parts: [
                        { mimeType: 'text/html', body: { data: encode('<p>hola</p>') } },
                        { mimeType: 'text/plain', body: { data: encode('hola') } },
                    ],
                },
            },
        })

        const [message] = await createGmailReader(client).search('q')

        expect(message.body).toBe('hola')
    })

    it('encuentra text/plain anidado más adentro que un multipart', async () => {
        const { client, get } = buildClient()
        get.mockResolvedValue({
            data: {
                id: 'm1',
                internalDate: '1785000000000',
                payload: {
                    headers: [{ name: 'From', value: 'a@b.test' }, { name: 'Subject', value: 'x' }],
                    mimeType: 'multipart/alternative',
                    parts: [
                        { mimeType: 'text/html', body: { data: encode('<p>html</p>') } },
                        {
                            mimeType: 'multipart/related',
                            parts: [
                                { mimeType: 'text/plain', body: { data: encode('texto plano anidado') } },
                            ],
                        },
                    ],
                },
            },
        })

        const [message] = await createGmailReader(client).search('q')

        expect(message.body).toBe('texto plano anidado')
    })

    it('prefiere text/plain hermano sobre multipart con solo html', async () => {
        const { client, get } = buildClient()
        get.mockResolvedValue({
            data: {
                id: 'm1',
                internalDate: '1785000000000',
                payload: {
                    headers: [{ name: 'From', value: 'a@b.test' }, { name: 'Subject', value: 'x' }],
                    mimeType: 'multipart/mixed',
                    parts: [
                        {
                            mimeType: 'multipart/related',
                            parts: [
                                { mimeType: 'text/html', body: { data: encode('<p>solo html</p>') } },
                            ],
                        },
                        { mimeType: 'text/plain', body: { data: encode('texto plano correcto') } },
                    ],
                },
            },
        })

        const [message] = await createGmailReader(client).search('q')

        expect(message.body).toBe('texto plano correcto')
    })

})

describe('createGmailReader().addLabel', () => {
    it('reutiliza el label existente', async () => {
        const { client, modify, labelsCreate } = buildClient()

        await createGmailReader(client).addLabel('m1', 'mostro-processed')

        expect(labelsCreate).not.toHaveBeenCalled()
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        }, { timeout: 15000 })
    })

    it('crea el label la primera vez', async () => {
        const { client, modify, labelsCreate } = buildClient()

        await createGmailReader(client).addLabel('m1', 'mostro-failed')

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

    it('reintenta crear el label después de un fallo transitorio', async () => {
        const { client, modify, labelsList, labelsCreate } = buildClient()
        const reader = createGmailReader(client)

        // Primera llamada: labels.list falla
        labelsList.mockRejectedValueOnce(new Error('Network error'))

        await expect(reader.addLabel('m1', 'mostro-failed')).rejects.toThrow('Network error')

        // Segunda llamada: labels.list funciona, label no existe, hay que crear
        labelsList.mockResolvedValueOnce({ data: { labels: [] } })
        labelsCreate.mockResolvedValueOnce({ data: { id: 'L_created' } })

        // El siguiente intento debe reintentarlo (sin re-lanzar el error cacheado)
        await reader.addLabel('m1', 'mostro-failed')

        // Verifica que se intentó crear el label en la segunda llamada
        expect(labelsCreate).toHaveBeenCalledWith({
            userId: 'me',
            requestBody: { name: 'mostro-failed', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        }, { timeout: 15000 })
        expect(modify).toHaveBeenLastCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L_created'] },
        }, { timeout: 15000 })
    })
})

describe('createGmailReader().removeLabel', () => {
    it('quita el label del mensaje', async () => {
        const { client, modify } = buildClient()

        await createGmailReader(client).removeLabel('m1', 'mostro-processed')

        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { removeLabelIds: ['L1'] },
        }, { timeout: 15000 })
    })
})

describe('createGmailReader — timeout y reintento en Gmail', () => {
    it('pasa timeout a messages.list y a messages.get', async () => {
        const { client, list, get } = buildClient()

        await createGmailReader(client).search('from:pedidos@farmacia.test')

        expect(list.mock.calls[0][1]).toEqual({ timeout: 15000 })
        expect(get.mock.calls[0][1]).toEqual({ timeout: 15000 })
    })

    it('reintenta messages.list ante un fallo transitorio y termina devolviendo los mails', async () => {
        vi.useFakeTimers()
        const { client, list } = buildClient()
        list.mockRejectedValueOnce(Object.assign(new Error('503'), { status: 503 }))
        list.mockResolvedValueOnce({ data: { messages: [{ id: 'm1' }] } })

        const pending = createGmailReader(client).search('q')
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

        const pending = createGmailReader(client).addLabel('m1', 'mostro-processed')
        await vi.advanceTimersByTimeAsync(5000)
        await pending

        expect(modify).toHaveBeenCalledTimes(2)
        vi.useRealTimers()
    })

    it('no reintenta modify ante un error no retriable', async () => {
        const { client, modify } = buildClient()
        modify.mockRejectedValue(Object.assign(new Error('rechazado'), { status: 403 }))

        await expect(createGmailReader(client).addLabel('m1', 'mostro-processed')).rejects.toThrow('rechazado')

        expect(modify).toHaveBeenCalledTimes(1)
    })
})
