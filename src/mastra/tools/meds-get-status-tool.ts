import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readMedsStatus } from '../lib/meds-run'

export const getMedsStatusTool = createTool({
    id: 'get-meds-status',
    description: 'Consulta el estado actual y compartido del pedido de medicamentos (mismo estado para todos los usuarios). El pedido está scopeado por mes (YYYY-MM); si no se especifica, consulta el mes actual.',
    inputSchema: z.object({
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes del pedido en formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
    outputSchema: z.looseObject({
        status: z.string(),
    }),
    mcp: {
        annotations: { readOnlyHint: true, idempotentHint: true },
    },
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        return readMedsStatus(context.mastra as any, input.yearMonth)
    },
})
