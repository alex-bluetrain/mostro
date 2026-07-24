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

            // El resume no lanza cuando un step falla: hay que mirar el status para que
            // el sistema externo pueda reintentar en vez de darlo por recibido.
            if (result.result?.status === 'failed') {
                return c.json({ ok: false, error: 'workflow failed' }, 502)
            }

            return c.json({ ok: true }, 200)
        },
    },
)
