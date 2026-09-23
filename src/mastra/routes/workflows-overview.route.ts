import { registerApiRoute } from '@mastra/core/server'
import { readWorkflowsOverview } from '@lib/workflows-overview'

const DEFAULT_MONTHS = 6
const MAX_MONTHS = 24

// The mostro-app dashboard needs to see, at a glance, where each monthly flow stands.
// The state already lives in Mastra's runs: this route only gathers them, it does not reinterpret them.
//
// It reads the household's shared state (the same one anyone sees over Telegram),
// so it does not filter by user. The invitation was already validated by the auth provider.
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
