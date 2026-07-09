import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readRefundsStatus } from '../lib/refunds-run'
import { refundsStateSchema } from '../workflows/refunds/schemas/refunds-state.schema'

export const getRefundsStatusTool = createTool({
    id: 'get-refunds-status',
    description: 'Consulta el estado actual del reembolso. El reembolso está scopeado por mes (YYYY-MM); si no se especifica, consulta el mes actual.',
    inputSchema: z.object({
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes del reembolso en formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
    outputSchema: refundsStateSchema.nullable(),
    mcp: {
        annotations: { readOnlyHint: true, idempotentHint: true },
    },
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        return readRefundsStatus(context.mastra as any, input.yearMonth)
    },
})
