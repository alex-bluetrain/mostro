import { registerApiRoute } from '@mastra/core/server'
import { receiveDeposit } from '../lib/refunds-run'

export const webhookRefundsDepositRoute = registerApiRoute(
    '/webhooks/refunds/deposit',
    {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
            const mastra = c.get('mastra')
            const body = await c.req.json()

            if (!body?.yearMonth || body?.depositAmount === undefined || !body?.depositDate) {
                return c.json({ ok: false, error: 'yearMonth, depositAmount and depositDate are required' }, 400)
            }

            const result = await receiveDeposit(mastra, body)
            console.log('/webhooks/refunds/deposit', JSON.stringify(result))
            return c.json({ ok: true }, 200)
        },
    },
)
