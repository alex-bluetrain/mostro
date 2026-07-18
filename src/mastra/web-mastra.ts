import { Mastra } from '@mastra/core/mastra';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { diapersWorkflow } from './workflows/diapers/diapers.workflow';
import { medsWorkflow } from './workflows/meds/meds.workflow';
import { refundsWorkflow } from './workflows/refunds/refunds.workflow';
import { weatherWorkflow } from './workflows/weather/weather.workflow';
import { MOSTRO_SUPERVISOR_INSTRUCTIONS, mostroSupervisorAgents, mostroSupervisorModel } from './agents/mostro-supervisor';

/**
 * Lean Mastra app for the OpenUI web surface (web/app/api/chat/route.ts).
 * Domain tools (get-*-status, etc.) read `context.mastra` to reach
 * `mastra.getWorkflow(...)` — an Agent used outside any Mastra app has no
 * such context and those tool calls throw. This registers the same
 * workflows/sub-agents pointed at the SAME sqlite file the Telegram-bound
 * app (src/mastra/index.ts) uses, so both surfaces see the same shared
 * order state. No server/apiRoutes/ngrok — this never runs in the Mastra
 * dev process, only inside the Next.js process.
 */
export function createWebMastraApp(dbUrl: string, instructions: string = MOSTRO_SUPERVISOR_INSTRUCTIONS) {
    const mostroSupervisorForWeb = new Agent({
        id: 'mostro-supervisor-web',
        name: 'Mostro Supervisor (Web)',
        instructions,
        model: mostroSupervisorModel,
        agents: mostroSupervisorAgents,
        memory: new Memory(),
    });

    new Mastra({
        workflows: { diapersWorkflow, medsWorkflow, refundsWorkflow, weatherWorkflow },
        agents: { ...mostroSupervisorAgents, mostroSupervisorForWeb },
        storage: new LibSQLStore({
            id: 'mastra-web-storage',
            url: dbUrl,
        }),
    });

    return mostroSupervisorForWeb;
}
