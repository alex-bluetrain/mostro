import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/meds-run', () => ({
    acknowledgeMedsOrder: vi.fn().mockResolvedValue({ ok: true }),
    confirmMedsDelivery: vi.fn().mockResolvedValue({ ok: true }),
}))

import { acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { medsOutcomeHandlers } from './meds-outcome-handlers'

const mastra = {} as never

describe('medsOutcomeHandlers', () => {
    it('meds.delivered toma el año del contexto y el mes de deliveryDate', async () => {
        const data = { deliveryDate: '2025-01-16', deliveryAddress: 'Av. Siempre Viva 742' }

        const result = await medsOutcomeHandlers['meds.delivered']({
            mastra,
            text: '',
            year: 2026,
            month: 8,
            data,
        })

        expect(result).toEqual({ ok: true })
        expect(confirmMedsDelivery).toHaveBeenCalledWith(mastra, {
            deliveryDate: '2025-01-16',
            deliveryAddress: 'Av. Siempre Viva 742',
            year: 2026,
            month: 1,
        })
    })

    it('meds.acknowledged usa el mes del contexto (sin fecha extraída)', async () => {
        const result = await medsOutcomeHandlers['meds.acknowledged']({
            mastra,
            text: '',
            year: 2026,
            month: 1,
            data: undefined,
        })

        expect(result).toEqual({ ok: true })
        expect(acknowledgeMedsOrder).toHaveBeenCalledWith(mastra, 2026, 1)
    })
})
