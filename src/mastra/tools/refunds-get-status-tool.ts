import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readRefundsStatus } from '@lib/refunds-run'
import { refundsStateSchema } from '@workflows/refunds/schemas/refunds-state.schema'

export const getRefundsStatusTool = createTool({
    id: 'get-refunds-status',
    description: 'Consulta el estado actual del reembolso. El reembolso está scopeado por mes: indicá siempre mes y año.',
    inputSchema: z.object({
        month: z.number().int().min(1).max(12).describe('Mes del reembolso (1-12). Usá el mes actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
        year: z.number().int().min(2020).max(2100).describe('Año del reembolso. Usá el año actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
    }),
    outputSchema: refundsStateSchema.nullable(),
    mcp: {
        annotations: { readOnlyHint: true, idempotentHint: true },
    },
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        return readRefundsStatus(context.mastra as any, input.year, input.month)
    },
})
