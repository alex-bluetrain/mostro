import { describe, it, expect } from 'vitest'
import { waitMedsConfirmationResumeSchema } from './wait-meds-confirmation-resume.schema'

describe('waitMedsConfirmationResumeSchema', () => {
    it('acepta una confirmación con fecha en formato YYYY-MM-DD', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(true)
    })

    it('rechaza una fecha con formato DD/MM/YYYY', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '01/08/2026',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(false)
    })

    it('rechaza una fecha con hora incluida', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01T10:00:00Z',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(false)
    })

    it('rechaza una confirmación sin deliveryAddress', () => {
        const result = waitMedsConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
        })
        expect(result.success).toBe(false)
    })
})
