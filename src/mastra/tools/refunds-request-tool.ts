import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { startRefundRequest } from '../lib/refunds-run'

export const requestRefundTool = createTool({
    id: 'request-refund',
    description: 'Inicia el pedido compartido de reembolso (monto y motivo). Si ya hay un reembolso en curso ese mes, informa el estado actual en vez de duplicarlo. El reembolso queda scopeado al mes en que se crea (YYYY-MM).',
    inputSchema: z.object({
        amount: z.number().describe('Monto a reembolsar'),
        reason: z.string().optional().describe('Motivo del reembolso'),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes al que scopear el reembolso, formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
    outputSchema: z.looseObject({}),
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        return startRefundRequest(context.mastra as any, input)
    },
})
