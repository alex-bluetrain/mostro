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
