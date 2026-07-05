import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readDiapersStatus, startDiapers } from '../lib/diapers-run'
import { addSubscriber } from '../lib/diapers-subscribers'

export const getDiapersStatusTool = createTool({
    id: 'get-diapers-status',
    description: 'Consulta el estado actual y compartido del pedido de pañales (mismo estado para todos los usuarios). El pedido está scopeado por mes (YYYY-MM); si no se especifica, consulta el mes actual.',
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
        return readDiapersStatus(context.mastra as any, input.yearMonth)
    },
})

export const requestDiapersTool = createTool({
    id: 'request-diapers',
    description: 'Inicia el pedido compartido de pañales (tipo y cantidad). Si ya hay un pedido en curso ese mes, informa el estado actual en vez de duplicarlo. El pedido queda scopeado al mes en que se crea (YYYY-MM).',
    inputSchema: z.object({
        diaperType: z.string().describe('Talla o tipo de pañal, ej. "talla M"'),
        quantity: z.number().describe('Cantidad de paquetes'),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes al que scopear el pedido, formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
    outputSchema: z.looseObject({}),
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        return startDiapers(context.mastra as any, input)
    },
})

export const subscribeDiapersTool = createTool({
    id: 'subscribe-diapers-notifications',
    description: 'Suscribe al usuario actual para recibir un aviso por Telegram cuando se confirme la fecha de entrega de pañales.',
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

        await addSubscriber({ resourceId, threadId })
        return { subscribed: true }
    },
})
