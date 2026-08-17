import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '@business/repositories'
import { emailFromResourceId } from '@business/identity'

export const subscribeTool = createTool({
    id: 'subscribe-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram sobre las novedades de la paciente: entregas de pañales, pedidos de medicamentos y reembolsos.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = emailFromResourceId(context?.agent?.resourceId ?? '')
        if (!email) {
            return { subscribed: false }
        }

        await subscriberRepository.add(email)
        return { subscribed: true }
    },
})
