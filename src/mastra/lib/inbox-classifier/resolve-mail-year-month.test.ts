import { describe, it, expect } from 'vitest'
import { resolveMailYearMonth } from './resolve-mail-year-month'

describe('resolveMailYearMonth', () => {
    it('usa el X-Received más viejo cuando hay varios (uno por hop)', () => {
        const headers = [
            { name: 'X-Received', value: 'by 2002:a05; Sun, 2 Aug 2026 09:00:00 -0300 (ART)' },
            { name: 'X-Received', value: 'by 2002:a05; Thu, 30 Jul 2026 23:58:00 -0300 (ART)' },
        ]

        expect(resolveMailYearMonth(headers, new Date('2026-08-02T12:00:00Z'))).toBe('2026-07')
    })

    it('ignora headers que no son X-Received', () => {
        const headers = [
            { name: 'Received', value: 'by mx.test; Sat, 1 Aug 2026 00:00:00 -0300 (ART)' },
            { name: 'X-Received', value: 'by 2002:a05; Thu, 30 Jul 2026 23:58:00 -0300 (ART)' },
        ]

        expect(resolveMailYearMonth(headers, new Date('2026-08-02T12:00:00Z'))).toBe('2026-07')
    })

    it('cae al fallback si no hay ningún header X-Received', () => {
        expect(resolveMailYearMonth([], new Date('2026-08-02T12:00:00Z'))).toBe('2026-08')
        expect(resolveMailYearMonth(undefined, new Date('2026-08-02T12:00:00Z'))).toBe('2026-08')
    })

    it('cae al fallback si el X-Received tiene una fecha ilegible', () => {
        const headers = [{ name: 'X-Received', value: 'by 2002:a05; garbage' }]

        expect(resolveMailYearMonth(headers, new Date('2026-08-02T12:00:00Z'))).toBe('2026-08')
    })
})
