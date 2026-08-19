import { describe, it, expect, vi } from 'vitest'
import { recentMonths, readWorkflowsOverview } from './workflows-overview'

describe('recentMonths', () => {
    it('returns the requested months newest first', () => {
        expect(recentMonths(2026, 8, 3)).toEqual([
            { year: 2026, month: 8 },
            { year: 2026, month: 7 },
            { year: 2026, month: 6 },
        ])
    })

    it('crosses the year boundary backwards', () => {
        expect(recentMonths(2026, 2, 4)).toEqual([
            { year: 2026, month: 2 },
            { year: 2026, month: 1 },
            { year: 2025, month: 12 },
            { year: 2025, month: 11 },
        ])
    })

    it('walks back more than a full year', () => {
        const months = recentMonths(2026, 1, 14)

        expect(months).toHaveLength(14)
        expect(months.at(-1)).toEqual({ year: 2024, month: 12 })
    })
})

// El overview pide un run por dominio y por mes: este doble responde sólo a los
// run ids que le cargamos y devuelve null para el resto, como haría Mastra.
function mastraWith(runs: Record<string, { status: string; initialState: Record<string, unknown> }>) {
    return {
        getWorkflow: vi.fn(() => ({
            getWorkflowRunById: vi.fn(async (runId: string) => runs[runId] ?? null),
        })),
    } as any
}

describe('readWorkflowsOverview', () => {
    it('returns one entry per existing run, tagged with its domain and month', async () => {
        const mastra = mastraWith({
            'diapers-2026-08': { status: 'suspended', initialState: { status: 'diapers_requested', year: 2026, month: 8 } },
            'refunds-2026-07': { status: 'success', initialState: { status: 'deposit_confirmed', year: 2026, month: 7 } },
        })

        const runs = await readWorkflowsOverview(mastra, { year: 2026, month: 8, months: 2 })

        expect(runs).toEqual([
            {
                domain: 'diapers',
                year: 2026,
                month: 8,
                runId: 'diapers-2026-08',
                runStatus: 'suspended',
                state: { status: 'diapers_requested', year: 2026, month: 8 },
            },
            {
                domain: 'refunds',
                year: 2026,
                month: 7,
                runId: 'refunds-2026-07',
                runStatus: 'success',
                state: { status: 'deposit_confirmed', year: 2026, month: 7 },
            },
        ])
    })

    it('skips months with no run at all', async () => {
        const runs = await readWorkflowsOverview(mastraWith({}), { year: 2026, month: 8, months: 3 })

        expect(runs).toEqual([])
    })

    it('skips runs created without state', async () => {
        const mastra = mastraWith({
            'meds-2026-08': { status: 'running', initialState: {} },
        })

        const runs = await readWorkflowsOverview(mastra, { year: 2026, month: 8, months: 1 })

        expect(runs).toEqual([])
    })
})
