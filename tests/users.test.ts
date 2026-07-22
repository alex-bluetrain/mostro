import { describe, expect, it } from 'vitest'
import { telegramIdFromResourceId } from '../src/mastra/lib/users'

describe('telegramIdFromResourceId', () => {
    it('extrae el id de un resourceId de telegram', () => {
        expect(telegramIdFromResourceId('telegram:5551234')).toBe('5551234')
    })

    it('devuelve null para otros providers', () => {
        expect(telegramIdFromResourceId('slack:U123')).toBeNull()
    })

    it('devuelve null para strings sin prefijo', () => {
        expect(telegramIdFromResourceId('5551234')).toBeNull()
    })

    it('devuelve null para telegram: vacío', () => {
        expect(telegramIdFromResourceId('telegram:')).toBeNull()
    })
})
