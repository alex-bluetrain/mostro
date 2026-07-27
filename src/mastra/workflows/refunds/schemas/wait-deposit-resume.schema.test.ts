import { describe, it, expect } from 'vitest'
import { waitDepositResumeSchema } from './wait-deposit-resume.schema'

describe('waitDepositResumeSchema', () => {
    it('acepta un depósito con fecha en formato YYYY-MM-DD', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositAmount: 500,
            depositDate: '2026-08-15',
        })
        expect(result.success).toBe(true)
    })

    it('rechaza una fecha con formato DD/MM/YYYY', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositAmount: 500,
            depositDate: '15/08/2026',
        })
        expect(result.success).toBe(false)
    })

    it('rechaza una fecha con hora incluida', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositAmount: 500,
            depositDate: '2026-08-15T10:00:00Z',
        })
        expect(result.success).toBe(false)
    })

    it('rechaza un depósito sin depositAmount', () => {
        const result = waitDepositResumeSchema.safeParse({
            depositDate: '2026-08-15',
        })
        expect(result.success).toBe(false)
    })
})
