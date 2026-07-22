import { describe, expect, it } from 'vitest'
import { parseResourceId } from '../src/mastra/lib/users'

describe('parseResourceId', () => {
    it('parsea un resourceId de telegram', () => {
        expect(parseResourceId('telegram:5551234')).toEqual({ kind: 'telegram', telegramId: '5551234' })
    })

    it('parsea un email como canónico', () => {
        expect(parseResourceId('ana@gmail.com')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
    })

    it('normaliza el email a lowercase', () => {
        expect(parseResourceId('Ana@Gmail.com')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
    })

    it('devuelve null para strings sin formato conocido', () => {
        expect(parseResourceId('5551234')).toBeNull()
    })

    it('devuelve null para telegram: vacío', () => {
        expect(parseResourceId('telegram:')).toBeNull()
    })

    it('recorta el sufijo de sub-agente en resourceIds de telegram', () => {
        expect(parseResourceId('telegram:5551234-diapersAgent')).toEqual({ kind: 'telegram', telegramId: '5551234' })
    })

    it('recorta el sufijo de sub-agente en resourceIds de email', () => {
        expect(parseResourceId('ana@gmail.com-diapersAgent')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
    })
})
