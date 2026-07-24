import { registerApiRoute } from '@mastra/core/server'
import { acknowledgeRefund } from '../lib/refunds-run'

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

            if (!result.ok) {
                if (result.reason === 'not_found') {
                    return c.json({ ok: false, error: 'run not found' }, 404)
                }
                if (result.reason === 'not_suspended') {
                    return c.json({ ok: false, error: 'run not suspended', status: result.status }, 409)
                }
                return c.json(
                    { ok: false, error: 'unexpected step', suspendedStep: result.suspendedStep, expected: result.expected },
                    409,
                )
            }

            return c.json({ ok: true }, 200)
        },
    },
)
