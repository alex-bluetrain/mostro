import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { userRepository } from '@business/repositories'
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

        // Prende la preferencia sobre un user existente: si el email no está
        // invitado no hay a quién suscribir, y decirle que sí sería mentira.
        const updated = await userRepository.setNotifications(email, true)
        return { subscribed: updated }
    },
})
