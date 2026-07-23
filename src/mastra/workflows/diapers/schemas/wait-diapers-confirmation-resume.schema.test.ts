import { describe, it, expect } from 'vitest'
import { waitDiapersConfirmationResumeSchema } from './wait-diapers-confirmation-resume.schema'

describe('waitDiapersConfirmationResumeSchema', () => {
    it('acepta una confirmación con quantity', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
            quantity: 12,
        })
        expect(result.success).toBe(true)
    })

    it('rechaza una confirmación sin quantity', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(false)
    })
})
