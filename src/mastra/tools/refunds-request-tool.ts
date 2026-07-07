import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { startRefundRequest } from '../lib/refunds-run'

export const requestRefundTool = createTool({
    id: 'request-refund',
    description: 'Inicia el pedido de reembolso de una orden. Si ya hay un reembolso en curso para esa orden, informa el estado actual en vez de duplicarlo. El reembolso queda scopeado al orderId indicado.',
    inputSchema: z.object({
        orderId: z.string().describe('Id de la orden a reembolsar'),
        amount: z.number().describe('Monto a reembolsar'),
        reason: z.string().optional().describe('Motivo del reembolso'),
    }),
    outputSchema: z.looseObject({}),
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        return startRefundRequest(context.mastra as any, input)
    },
})
