import { describe, it, expect } from 'vitest'
import { toResumeResult } from './poll-step'

describe('toResumeResult', () => {
    it('propaga el rechazo con su motivo', () => {
        expect(toResumeResult({ ok: false, reason: 'not_suspended' }))
            .toEqual({ ok: false, reason: 'not_suspended' })
    })

    it('pone un motivo por defecto cuando el rechazo no trae ninguno', () => {
        expect(toResumeResult({ ok: false }).reason).toBe('sin motivo')
    })

    it('trata un run que terminó en failed como fallo, no como éxito', () => {
        const result = toResumeResult({ ok: true, result: { status: 'failed' } })

        expect(result.ok).toBe(false)
        expect(result.reason).toContain('falló al ejecutar')
    })

    // Meds y refunds vuelven a suspenderse en la etapa siguiente: eso es el camino feliz.
    it('trata un run que quedó suspendido como éxito', () => {
        expect(toResumeResult({ ok: true, result: { status: 'suspended' } }))
            .toEqual({ ok: true })
    })

    it('trata un run exitoso como éxito', () => {
        expect(toResumeResult({ ok: true, result: { status: 'success' } }))
            .toEqual({ ok: true })
    })
})
