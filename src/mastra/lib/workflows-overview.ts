import type { Mastra } from '@mastra/core/mastra'
import { getDiapersRunId } from '@workflows/diapers/utils/diapers.utils'
import { getMedsRunId } from '@workflows/meds/utils/meds.utils'
import { getRefundsRunId } from '@workflows/refunds/utils/refunds.utils'

export const OVERVIEW_DOMAINS = ['diapers', 'meds', 'refunds'] as const

export type OverviewDomain = (typeof OVERVIEW_DOMAINS)[number]

// El run id de cada flow mensual es determinista, así que el overview no lista runs:
// pide los meses que le interesan. Un mes sin pedido simplemente no está.
const runIdByDomain: Record<OverviewDomain, (year: number, month: number) => string> = {
    diapers: getDiapersRunId,
    meds: getMedsRunId,
    refunds: getRefundsRunId,
}

const workflowIdByDomain: Record<OverviewDomain, string> = {
    diapers: 'diapersWorkflow',
    meds: 'medsWorkflow',
    refunds: 'refundsWorkflow',
}

export type OverviewRun = {
    domain: OverviewDomain
    year: number
    month: number
    runId: string
    // Estado del run en Mastra (running, suspended, success, failed): dice si el flow
    // está vivo esperando un mail o si terminó.
    runStatus: string
    // Estado de negocio del dominio (diapers_requested, deposit_confirmed, ...).
    state: Record<string, unknown>
}

// Los N meses hasta `year`/`month` inclusive, del más nuevo al más viejo.
export function recentMonths(year: number, month: number, count: number) {
    return Array.from({ length: count }, (_, i) => {
        const offset = month - 1 - i
        return {
            year: year + Math.floor(offset / 12),
            month: ((offset % 12) + 12) % 12 + 1,
        }
    })
}

export async function readWorkflowsOverview(
    mastra: Mastra,
    args: { year: number; month: number; months: number },
): Promise<OverviewRun[]> {
    const months = recentMonths(args.year, args.month, args.months)

    const reads = OVERVIEW_DOMAINS.flatMap(domain =>
        months.map(async ({ year, month }): Promise<OverviewRun | null> => {
            const runId = runIdByDomain[domain](year, month)
            const run = await mastra.getWorkflow(workflowIdByDomain[domain]).getWorkflowRunById(runId)

            if (!run?.initialState || Object.keys(run.initialState).length === 0) {
                return null
            }

            return { domain, year, month, runId, runStatus: run.status, state: run.initialState }
        }),
    )

    return (await Promise.all(reads)).filter((run): run is OverviewRun => run !== null)
}
