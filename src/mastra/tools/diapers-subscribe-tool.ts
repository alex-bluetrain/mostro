import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '../../business/repositories'

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

        await subscriberRepository.add('diapers', { resourceId, threadId })
        return { subscribed: true }
    },
})
