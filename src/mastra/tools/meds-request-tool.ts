import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getUserByResourceId } from '@business/identity'
import { startMedsOrder } from '@lib/meds-run'

export const requestMedsTool = createTool({
    id: 'request-meds',
    description: 'Inicia el pedido compartido de medicamentos a partir de las recetas indicadas. Si ya hay un pedido en curso ese mes, informa el estado actual en vez de duplicarlo. El pedido queda scopeado al mes en que se crea (YYYY-MM).',
    inputSchema: z.object({
        medications: z.array(z.string()).describe('Lista de medicamentos recetados a pedir'),
        month: z.number().int().min(1).max(12).describe('Mes al que scopear el pedido (1-12). Usá el mes actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
        year: z.number().int().min(2020).max(2100).describe('Año del pedido. Usá el año actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
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
        return startMedsOrder(context.mastra as any, {
            medications: input.medications,
            year: input.year,
            month: input.month,
            requestedBy: user.name.trim(),
        })
    },
})
