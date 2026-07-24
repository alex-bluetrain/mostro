import { describe, it, expect } from 'vitest'
import { requestDiapersInputSchema } from './request-diapers-input.schema'

describe('requestDiapersInputSchema', () => {
    it.each(['M', 'G', 'XG'])('acepta el talle %s con requestedBy', (size) => {
        const result = requestDiapersInputSchema.safeParse({ size, requestedBy: 'Ana' })
        expect(result.success).toBe(true)
    })

    it('rechaza un talle fuera del enum', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'L', requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })

    it('rechaza una solicitud sin talle', () => {
        const result = requestDiapersInputSchema.safeParse({ requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })

    it('rechaza una solicitud sin requestedBy', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'M' })
        expect(result.success).toBe(false)
    })

    it('rechaza requestedBy vacío', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'M', requestedBy: '' })
        expect(result.success).toBe(false)
    })
})
