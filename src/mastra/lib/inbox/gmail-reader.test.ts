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
        }])
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

    it('ordena los mails del más viejo al más nuevo', async () => {
        const { client, list, get } = buildClient()
        list.mockResolvedValue({ data: { messages: [{ id: 'nuevo' }, { id: 'viejo' }] } })
        get.mockImplementation(async ({ id }: { id: string }) => ({
            data: {
                id,
                internalDate: id === 'viejo' ? '1000' : '2000',
                payload: {
                    headers: [{ name: 'From', value: 'a@b.test' }, { name: 'Subject', value: 's' }],
                    mimeType: 'text/plain',
                    body: { data: encode('x') },
                },
            },
        }))

        const messages = await createGmailReader(client).search('q')

        expect(messages.map(m => m.id)).toEqual(['viejo', 'nuevo'])
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
        })
    })

    it('crea el label la primera vez', async () => {
        const { client, modify, labelsCreate } = buildClient()

        await createGmailReader(client).addLabel('m1', 'mostro-failed')

        expect(labelsCreate).toHaveBeenCalledWith({
            userId: 'me',
            requestBody: { name: 'mostro-failed', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        })
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
        })
    })
})
