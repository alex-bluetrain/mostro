import { describe, it, expect } from 'vitest'
import { requestDiapersInputSchema } from './request-diapers-input.schema'

describe('requestDiapersInputSchema', () => {
    it.each(['M', 'G', 'XG'])('acepta el talle %s', (size) => {
        const result = requestDiapersInputSchema.safeParse({ size })
        expect(result.success).toBe(true)
    })

    it('rechaza un talle fuera del enum', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'L' })
        expect(result.success).toBe(false)
    })

    it('rechaza una solicitud sin talle', () => {
        const result = requestDiapersInputSchema.safeParse({ requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })
})
