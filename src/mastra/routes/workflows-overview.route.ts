import { registerApiRoute } from '@mastra/core/server'
import { readWorkflowsOverview } from '@lib/workflows-overview'

const DEFAULT_MONTHS = 6
const MAX_MONTHS = 24

// El dashboard de mostro-web necesita ver, de un saque, en qué anda cada flow mensual.
// El estado ya vive en los runs de Mastra: esta ruta sólo los junta, no los reinterpreta.
//
// Es lectura del estado compartido de la casa (el mismo que ve cualquiera por Telegram),
// así que no filtra por usuario. La invitación ya la validó el auth provider.
export const workflowsOverviewRoute = registerApiRoute('/workflows/overview', {
    method: 'GET',
    handler: async c => {
        const now = new Date()
        const year = Number(c.req.query('year') ?? now.getFullYear())
        const month = Number(c.req.query('month') ?? now.getMonth() + 1)
        const months = Number(c.req.query('months') ?? DEFAULT_MONTHS)

        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return c.json({ error: 'Invalid year or month' }, 400)
        }

        if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
            return c.json({ error: `months must be between 1 and ${MAX_MONTHS}` }, 400)
        }

        const runs = await readWorkflowsOverview(c.get('mastra'), { year, month, months })

        return c.json({ year, month, months, runs })
    },
})
