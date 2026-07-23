import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '../../business/repositories'
import { emailFromResourceId } from '../../business/identity'

export const subscribeRefundsTool = createTool({
    id: 'subscribe-refunds-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram cuando el reembolso sea reconocido por el procesador de pagos, cuando se confirme y cuando el depósito llegue a la cuenta.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = emailFromResourceId(context?.agent?.resourceId ?? '')
        if (!email) {
            return { subscribed: false }
        }

        await subscriberRepository.add('refunds', email)
        return { subscribed: true }
    },
})
