import { describe, it, expect } from 'vitest'
import { GmailMessage } from './gmail-message'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

describe('GmailMessage — headers', () => {
    it('limpia el display name del remitente y normaliza a minúsculas', () => {
        const message = new GmailMessage('m1', {
            payload: { headers: [{ name: 'From', value: 'Farmacia <Pedidos@Farmacia.test>' }] },
        })

        expect(message.from).toBe('pedidos@farmacia.test')
    })

    it('deja el remitente como viene cuando no hay display name', () => {
        const message = new GmailMessage('m1', {
            payload: { headers: [{ name: 'From', value: ' pedidos@farmacia.test ' }] },
        })

        expect(message.from).toBe('pedidos@farmacia.test')
    })

    it('expone los headers del nodo raíz, sin nulls', () => {
        const message = new GmailMessage('m1', {
            payload: {
                headers: [
                    { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                    { name: 'Subject', value: 'Confirmación de pedido' },
                    { name: 'X-Malformed', value: null },
                    { name: null, value: 'sin-nombre' },
                ],
            },
        })

        expect(message.headers).toEqual([
            { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
            { name: 'Subject', value: 'Confirmación de pedido' },
        ])
    })

    it('conserva un header con valor vacío', () => {
        const message = new GmailMessage('m1', {
            payload: { headers: [{ name: 'Subject', value: '' }] },
        })

        expect(message.headers).toEqual([{ name: 'Subject', value: '' }])
        expect(message.subject).toBe('')
    })
})

describe('GmailMessage — cuerpo', () => {
    it('decodifica el body del nodo raíz', () => {
        const message = new GmailMessage('m1', {
            payload: { mimeType: 'text/plain', body: { data: encode('Entregamos el 11/03.') } },
        })

        expect(message.body).toBe('Entregamos el 11/03.')
    })

    it('extrae la parte text/plain cuando el mail es multipart', () => {
        const message = new GmailMessage('m1', {
            payload: {
                mimeType: 'multipart/alternative',
                parts: [
                    { mimeType: 'text/html', body: { data: encode('<p>hola</p>') } },
                    { mimeType: 'text/plain', body: { data: encode('hola') } },
                ],
            },
        })

        expect(message.body).toBe('hola')
    })

    it('encuentra text/plain anidado más adentro que un multipart', () => {
        const message = new GmailMessage('m1', {
            payload: {
                mimeType: 'multipart/alternative',
                parts: [
                    { mimeType: 'text/html', body: { data: encode('<p>html</p>') } },
                    {
                        mimeType: 'multipart/related',
                        parts: [{ mimeType: 'text/plain', body: { data: encode('texto plano anidado') } }],
                    },
                ],
            },
        })

        expect(message.body).toBe('texto plano anidado')
    })

    it('prefiere text/plain hermano sobre multipart con solo html', () => {
        const message = new GmailMessage('m1', {
            payload: {
                mimeType: 'multipart/mixed',
                parts: [
                    {
                        mimeType: 'multipart/related',
                        parts: [{ mimeType: 'text/html', body: { data: encode('<p>solo html</p>') } }],
                    },
                    { mimeType: 'text/plain', body: { data: encode('texto plano correcto') } },
                ],
            },
        })

        expect(message.body).toBe('texto plano correcto')
    })

    it('cae al primer body con contenido cuando no hay ninguna parte text/plain', () => {
        const message = new GmailMessage('m1', {
            payload: {
                mimeType: 'multipart/alternative',
                parts: [
                    { mimeType: 'text/html', body: { data: null } },
                    { mimeType: 'text/html', body: { data: encode('<p>solo html</p>') } },
                ],
            },
        })

        expect(message.body).toBe('<p>solo html</p>')
    })

    it('devuelve string vacío cuando el mail no trae payload', () => {
        const message = new GmailMessage('m1', {})

        expect(message.body).toBe('')
        expect(message.from).toBe('')
        expect(message.subject).toBe('')
        expect(message.headers).toEqual([])
    })
})

describe('GmailMessage.toInbox', () => {
    it('arma el mensaje que consume el poller', () => {
        const message = new GmailMessage('m1', {
            internalDate: '1785000000000',
            payload: {
                headers: [
                    { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                    { name: 'Subject', value: 'Confirmación de pedido' },
                ],
                mimeType: 'text/plain',
                body: { data: encode('Entregamos el 11/03.') },
            },
        })

        expect(message.toInbox()).toEqual({
            id: 'm1',
            from: 'pedidos@farmacia.test',
            subject: 'Confirmación de pedido',
            body: 'Entregamos el 11/03.',
            receivedAt: new Date(1785000000000),
            headers: [
                { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                { name: 'Subject', value: 'Confirmación de pedido' },
            ],
        })
    })

    it('usa epoch cuando el mail no trae internalDate', () => {
        const message = new GmailMessage('m1', { payload: {} })

        expect(message.receivedAt).toEqual(new Date(0))
    })
})
