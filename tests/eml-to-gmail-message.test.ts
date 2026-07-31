import { describe, it, expect } from 'vitest'
import { emlToGmailMessage, fixtureUrl } from './fixtures/eml-to-gmail-message'
import { stripMailBody } from '@lib/inbox-classifier/strip-mail-body'

// Este archivo protege el uso de la API interna `MailParser.tree` (ver comentario en
// eml-to-gmail-message.ts): si un upgrade de mailparser cambia esa forma, estos asserts
// deben fallar acá, en CI, en vez de que el CLI produzca silenciosamente un payload distinto
// al que Gmail realmente devuelve.
describe('emlToGmailMessage', () => {
    it('convierte un mail text/plain suelto en una parte única sin sub-partes', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('confirmacion-entrega.eml'))

        expect(payload.mimeType).toBe('text/plain')
        expect(payload.body?.data).toBeTruthy()
        expect(payload.parts).toBeUndefined()
    })

    it('convierte un mail multipart/alternative con una sola parte HTML (sin text/plain)', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('mail-html.eml'))

        expect(payload.mimeType).toBe('multipart/alternative')
        expect(payload.body).toBeUndefined()
        expect(payload.parts).toHaveLength(1)
        expect(payload.parts?.[0].mimeType).toBe('text/html')
        expect(payload.parts?.some(p => p.mimeType === 'text/plain')).toBe(false)
    })

    it('conserva los headers del nodo raíz (Date, From)', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('confirmacion-entrega.eml'))

        const headerNames = (payload.headers ?? []).map(h => h.name.toLowerCase())
        expect(headerNames).toContain('date')
        expect(headerNames).toContain('from')

        const from = payload.headers?.find(h => h.name.toLowerCase() === 'from')
        expect(from?.value).toContain('farmacia@proveedor.test')
    })

    it('stripMailBody sobre el mail HTML-only devuelve texto sin tags', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('mail-html.eml'))

        const text = stripMailBody(payload)
        expect(text).toContain('Fecha')
        expect(text).toContain('29/07/2026')
        expect(text).not.toContain('<td')
        expect(text).not.toContain('<style')
    })
})
