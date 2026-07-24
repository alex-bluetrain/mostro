import { describe, it, expect } from 'vitest'
import { yearMonthFromRunId } from './date-scope'

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
