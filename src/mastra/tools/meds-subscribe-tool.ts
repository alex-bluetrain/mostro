import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '../../business/repositories'
import { emailFromResourceId } from '../../business/identity'

export const subscribeMedsTool = createTool({
    id: 'subscribe-meds-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram cuando la farmacia confirme la recepción del pedido y cuando se confirme la fecha de entrega.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = emailFromResourceId(context?.agent?.resourceId ?? '')
        if (!email) {
            return { subscribed: false }
        }

        await subscriberRepository.add('meds', email)
        return { subscribed: true }
    },
})
