import { registerApiRoute } from '@mastra/core/server'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from '../lib/refunds-run'

export const webhookRefundsAckRoute = registerApiRoute(
    '/webhooks/refunds/ack',
    {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
            const mastra = c.get('mastra')
            const body = await c.req.json()

            if (!body?.yearMonth) {
                return c.json({ ok: false, error: 'yearMonth (YYYY-MM) is required' }, 400)
            }

            const result = await acknowledgeRefund(mastra, body.yearMonth)
            console.log('/webhooks/refunds/ack', JSON.stringify(result))
            return c.json({ ok: true }, 200)
        },
    },
)

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
