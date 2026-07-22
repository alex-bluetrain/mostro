import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '../../business/repositories'

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

        await subscriberRepository.add('meds', { resourceId, threadId })
        return { subscribed: true }
    },
})
