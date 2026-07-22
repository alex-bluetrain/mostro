import { describe, expect, it } from 'vitest'
import { parseAllowedEmails } from '../src/mastra/lib/google-auth'

describe('parseAllowedEmails', () => {
    it('parsea una lista separada por comas', () => {
        expect(parseAllowedEmails('ana@gmail.com,juan@gmail.com')).toEqual(['ana@gmail.com', 'juan@gmail.com'])
    })

    it('normaliza espacios y mayúsculas', () => {
        expect(parseAllowedEmails(' Ana@Gmail.com , JUAN@gmail.com ')).toEqual(['ana@gmail.com', 'juan@gmail.com'])
    })

    it('descarta entradas vacías', () => {
        expect(parseAllowedEmails('ana@gmail.com,,')).toEqual(['ana@gmail.com'])
    })

    it('devuelve lista vacía para undefined', () => {
        expect(parseAllowedEmails(undefined)).toEqual([])
    })
})
