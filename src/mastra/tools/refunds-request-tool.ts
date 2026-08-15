import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { startRefundRequest } from '@lib/refunds-run'
import { getUserByResourceId } from '@business/identity'

export const requestRefundTool = createTool({
    id: 'request-refund',
    description: 'Inicia el pedido compartido de reembolso (monto y motivo). Si ya hay un reembolso en curso ese mes, informa el estado actual en vez de duplicarlo. El reembolso queda scopeado al mes en que se crea (YYYY-MM).',
    inputSchema: z.object({
        amount: z.number().describe('Monto a reembolsar'),
        reason: z.string().optional().describe('Motivo del reembolso'),
        month: z.number().int().min(1).max(12).describe('Mes al que scopear el reembolso (1-12). Usá el mes actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
        year: z.number().int().min(2020).max(2100).describe('Año del reembolso. Usá el año actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
    }),
    outputSchema: z.looseObject({}),
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        if (!user?.name?.trim()) {
            return {
                ok: false,
                reason: 'requester_unidentified',
                message: 'Todavía no sé tu nombre, así que no registré el pedido. ¿Cómo te llamás?',
            }
        }
        return startRefundRequest(context.mastra as any, {
            amount: input.amount,
            reason: input.reason,
            year: input.year,
            month: input.month,
            requestedBy: user.name.trim(),
        })
    },
})
