import { describe, it, expect } from 'vitest'
import { medsWorkflowInputSchema } from './meds-workflow-input.schema'

describe('medsWorkflowInputSchema', () => {
    it('acepta medicamentos con requestedBy', () => {
        const result = medsWorkflowInputSchema.safeParse({ medications: ['ibuprofeno'], requestedBy: 'Ana' })
        expect(result.success).toBe(true)
    })

    it('rechaza sin requestedBy', () => {
        const result = medsWorkflowInputSchema.safeParse({ medications: ['ibuprofeno'] })
        expect(result.success).toBe(false)
    })

    it('rechaza requestedBy vacío', () => {
        const result = medsWorkflowInputSchema.safeParse({ medications: ['ibuprofeno'], requestedBy: '' })
        expect(result.success).toBe(false)
    })
})
