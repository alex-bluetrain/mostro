import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@lib/workflows-overview', () => ({
    readWorkflowsOverview: vi.fn(),
}))

import { workflowsOverviewRoute } from './workflows-overview.route'
import { readWorkflowsOverview } from '@lib/workflows-overview'

const mastra = { tag: 'mastra' }

// El handler sólo usa `req.query`, `get('mastra')` y `json()`.
function run(query: Record<string, string> = {}): Promise<{ body: any; status?: number }> {
    const c = {
        req: { query: (key: string) => query[key] },
        get: (key: string) => (key === 'mastra' ? mastra : undefined),
        json: (body: unknown, status?: number) => ({ body, status }),
    }
    const handler = (workflowsOverviewRoute as { handler: (c: unknown) => Promise<any> }).handler
    return handler(c)
}

describe('workflowsOverviewRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(readWorkflowsOverview).mockResolvedValue([])
    })

    it('defaults to the last 6 months ending in the current one', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-19T00:00:00Z'))

        const response = await run()

        expect(readWorkflowsOverview).toHaveBeenCalledWith(mastra, { year: 2026, month: 8, months: 6 })
        expect(response.body).toMatchObject({ year: 2026, month: 8, months: 6 })

        vi.useRealTimers()
    })

    it('honours the requested scope', async () => {
        await run({ year: '2025', month: '3', months: '12' })

        expect(readWorkflowsOverview).toHaveBeenCalledWith(mastra, { year: 2025, month: 3, months: 12 })
    })

    it('returns the runs it read', async () => {
        vi.mocked(readWorkflowsOverview).mockResolvedValue([
            { domain: 'meds', year: 2026, month: 8, runId: 'meds-2026-08', runStatus: 'suspended', state: {} },
        ] as any)

        const response = await run()

        expect(response.body.runs).toHaveLength(1)
        expect(response.body.runs[0].domain).toBe('meds')
    })

    it('400s on an out of range month', async () => {
        const response = await run({ month: '13' })

        expect(response.status).toBe(400)
        expect(readWorkflowsOverview).not.toHaveBeenCalled()
    })

    it('400s on a non numeric year', async () => {
        const response = await run({ year: 'ayer' })

        expect(response.status).toBe(400)
        expect(readWorkflowsOverview).not.toHaveBeenCalled()
    })

    it('400s when months exceeds the cap', async () => {
        const response = await run({ months: '99' })

        expect(response.status).toBe(400)
        expect(readWorkflowsOverview).not.toHaveBeenCalled()
    })
})
