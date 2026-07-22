import { describe, expect, it } from 'vitest'
import { parseResourceId } from '../src/business/identity'

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

    it('recorta el sufijo de cada sub-agente registrado', () => {
        expect(parseResourceId('ana@gmail.com-weatherAgent')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
        expect(parseResourceId('ana@gmail.com-medsAgent')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
        expect(parseResourceId('ana@gmail.com-refundsAgent')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
    })

    it('no recorta sufijos que no son sub-agentes registrados', () => {
        expect(parseResourceId('ana@gmail.com-customAgent')).toEqual({ kind: 'email', email: 'ana@gmail.com-customagent' })
    })
})
