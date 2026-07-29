import { describe, it, expect } from 'vitest'
import { stripMailBody } from './strip-mail-body'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

describe('stripMailBody', () => {
    it('devuelve el texto plano tal cual cuando no hay citas', () => {
        const payload = {
            mimeType: 'text/plain',
            body: { data: encode('Confirmamos la entrega para el 11/03.') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('corta el hilo citado del texto plano', () => {
        const payload = {
            mimeType: 'text/plain',
            body: { data: encode('Confirmamos la entrega para el 11/03.\n\n> Cuando entregan?\n> Gracias.') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('extrae el texto de un mail solo-html con cheerio', () => {
        const payload = {
            mimeType: 'text/html',
            body: { data: encode('<html><body><p>Confirmamos la entrega para el <b>11/03</b>.</p></body></html>') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('prefiere text/plain sobre text/html cuando ambos están presentes', () => {
        const payload = {
            mimeType: 'multipart/alternative',
            parts: [
                { mimeType: 'text/plain', body: { data: encode('versión en texto plano') } },
                { mimeType: 'text/html', body: { data: encode('<p>versión en html</p>') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('versión en texto plano')
    })

    it('encuentra la parte plana anidada dentro de multipart/mixed > multipart/alternative', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            parts: [
                {
                    mimeType: 'multipart/alternative',
                    parts: [
                        { mimeType: 'text/plain', body: { data: encode('contenido anidado') } },
                    ],
                },
                { mimeType: 'application/pdf', body: { data: encode('binario-irrelevante') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('contenido anidado')
    })

    it('devuelve string vacío cuando no hay ninguna parte de texto', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            parts: [
                { mimeType: 'application/pdf', body: { data: encode('binario') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('')
    })

    it('devuelve string vacío con payload undefined', () => {
        expect(stripMailBody(undefined)).toBe('')
    })
})
