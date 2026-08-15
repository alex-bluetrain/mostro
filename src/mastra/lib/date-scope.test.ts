import { describe, it, expect } from 'vitest'
import { formatYearMonth, monthOfIsoDate } from './date-scope'

describe('formatYearMonth', () => {
    it('pads the month to two digits', () => {
        expect(formatYearMonth(2026, 1)).toBe('2026-01')
        expect(formatYearMonth(2026, 12)).toBe('2026-12')
    })
})

describe('monthOfIsoDate', () => {
    it('takes the month from a YYYY-MM-DD date', () => {
        expect(monthOfIsoDate('2025-01-16')).toBe(1)
        expect(monthOfIsoDate('2026-08-20')).toBe(8)
    })
})
