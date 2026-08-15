import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/diapers-run', () => ({ confirmDiapersDate: vi.fn().mockResolvedValue({ ok: true }) }))

import { confirmDiapersDate } from '@lib/diapers-run'
import { diapersOutcomeHandlers } from './diapers-outcome-handlers'

const mastra = {} as never

describe('diapersOutcomeHandlers', () => {
    it('toma el año del contexto y el mes de deliveryDate', async () => {
        // El LLM puede adivinar mal el año ("2025-01-16" para un pedido de 2026-01):
        // el año sale de los headers (contexto), el mes de la fecha de entrega.
        const data = { deliveryDate: '2025-01-16', deliveryAddress: 'Av. Siempre Viva 742', quantity: 12 }

        const result = await diapersOutcomeHandlers['diapers.confirmed']({
            mastra,
            text: '',
            year: 2026,
            month: 8,
            data,
        })

        expect(result).toEqual({ ok: true })
        expect(confirmDiapersDate).toHaveBeenCalledWith(mastra, {
            deliveryDate: '2025-01-16',
            deliveryAddress: 'Av. Siempre Viva 742',
            quantity: 12,
            year: 2026,
            month: 1,
        })
    })
})
