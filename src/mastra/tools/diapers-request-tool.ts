import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { startDiapers } from '../lib/diapers-run'
import { getUserByResourceId } from '../../business/identity'

export const requestDiapersTool = createTool({
    id: 'request-diapers',
    description: 'Inicia el pedido compartido de pañales por talle (M/G/XG). Si ya hay un pedido en curso ese mes, informa el estado actual en vez de duplicarlo. El pedido queda scopeado al mes en que se crea (YYYY-MM).',
    inputSchema: z.object({
        size: z.enum(['M', 'G', 'XG']).describe('Talle del pañal: M (Mediano), G (Grande), XG (Extra Grande)'),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes al que scopear el pedido, formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
    outputSchema: z.looseObject({}),
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        return startDiapers(context.mastra as any, { ...input, requestedBy: user?.name || undefined })
    },
})
