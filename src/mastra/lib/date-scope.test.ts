import { describe, it, expect } from 'vitest'
import { yearMonthFromRunId, yearMonthOf, previousYearMonth } from './date-scope'

describe('yearMonthFromRunId', () => {
  it('extracts the year-month from a domain run id', () => {
    expect(yearMonthFromRunId('diapers-2026-07')).toBe('2026-07')
    expect(yearMonthFromRunId('meds-2026-07')).toBe('2026-07')
    expect(yearMonthFromRunId('refunds-2026-12')).toBe('2026-12')
  })

  it('returns the run id unchanged when it has no domain prefix', () => {
    expect(yearMonthFromRunId('2026-07')).toBe('2026-07')
  })
})

describe('yearMonthOf', () => {
    it('deriva el YYYY-MM de una fecha', () => {
        expect(yearMonthOf(new Date(2026, 6, 30))).toBe('2026-07')
    })

    it('padea el mes a dos dígitos', () => {
        expect(yearMonthOf(new Date(2026, 0, 5))).toBe('2026-01')
    })
})

describe('previousYearMonth', () => {
    it('retrocede un mes dentro del mismo año', () => {
        expect(previousYearMonth('2026-08')).toBe('2026-07')
    })

    it('cruza el cambio de año', () => {
        expect(previousYearMonth('2026-01')).toBe('2025-12')
    })
})
