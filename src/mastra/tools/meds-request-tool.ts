import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getUserByResourceId } from '../../business/identity'
import { startMedsOrder } from '../lib/meds-run'

export const requestMedsTool = createTool({
    id: 'request-meds',
    description: 'Inicia el pedido compartido de medicamentos a partir de las recetas indicadas. Si ya hay un pedido en curso ese mes, informa el estado actual en vez de duplicarlo. El pedido queda scopeado al mes en que se crea (YYYY-MM).',
    inputSchema: z.object({
        medications: z.array(z.string()).describe('Lista de medicamentos recetados a pedir'),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes al que scopear el pedido, formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
    outputSchema: z.looseObject({}),
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        return startMedsOrder(context.mastra as any, { ...input, requestedBy: user?.name || undefined })
    },
})
