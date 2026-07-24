import { registerApiRoute } from '@mastra/core/server'
import { confirmRefund } from '../lib/refunds-run'

export const webhookRefundsConfirmationRoute = registerApiRoute(
    '/webhooks/refunds/confirmation',
    {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
            const mastra = c.get('mastra')
            const body = await c.req.json()

            if (!body?.yearMonth || !body?.refundReference) {
                return c.json({ ok: false, error: 'yearMonth and refundReference are required' }, 400)
            }

            const result = await confirmRefund(mastra, body)
            console.log('/webhooks/refunds/confirmation', JSON.stringify(result))
            return c.json({ ok: true }, 200)
        },
    },
)
