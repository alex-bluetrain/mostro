import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readMedsStatus, startMedsOrder } from '../lib/meds-run'
import { addMedsSubscriber } from '../lib/meds-subscribers'

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
        return startMedsOrder(context.mastra as any, input)
    },
})

export const subscribeMedsTool = createTool({
    id: 'subscribe-meds-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram cuando la farmacia confirme la recepción del pedido y cuando se confirme la fecha de entrega.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const resourceId = context?.agent?.resourceId
        const threadId = context?.agent?.threadId

        if (!resourceId || !threadId) {
            return { subscribed: false }
        }

        await addMedsSubscriber({ resourceId, threadId })
        return { subscribed: true }
    },
})
