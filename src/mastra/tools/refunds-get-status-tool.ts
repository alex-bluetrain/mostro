import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readRefundsStatus } from '../lib/refunds-run'

export const getRefundsStatusTool = createTool({
    id: 'get-refunds-status',
    description: 'Consulta el estado actual del reembolso de una orden puntual, identificada por orderId.',
    inputSchema: z.object({
        orderId: z.string().describe('Id de la orden cuyo reembolso se quiere consultar'),
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
        return readRefundsStatus(context.mastra as any, input.orderId)
    },
})
