import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { userRepository } from '@business/repositories'
import { emailFromResourceId } from '@business/identity'
import { appLogger } from '@lib/app-logger'

// El alta sigue siendo por Telegram: esta tool sólo suma Discord como canal
// extra sobre una identidad que ya existe. Por eso no crea usuarios ni toca
// invitaciones, y el email sale del resourceId (no se lo pedimos al modelo).
export const linkDiscordTool = createTool({
    id: 'link-discord',
    description:
        'Vincula la cuenta de Discord del usuario actual para que pueda hablar con Mostro por ahí. Requiere el ID numérico de usuario de Discord, que se obtiene con click derecho sobre el propio nombre > Copiar ID de usuario (con el Modo desarrollador activado).',
    inputSchema: z.object({
        discordId: z
            .string()
            .regex(/^\d{17,20}$/, 'El ID de Discord es un número de 17 a 20 dígitos'),
    }),
    outputSchema: z.object({
        linked: z.boolean(),
        reason: z.enum(['ok', 'unknown-user', 'already-taken']),
    }),
    execute: async ({ discordId }, context) => {
        const email = emailFromResourceId(context?.agent?.resourceId ?? '')
        if (!email) {
            return { linked: false, reason: 'unknown-user' as const }
        }

        try {
            const updated = await userRepository.linkDiscordId(email, discordId)
            return updated
                ? { linked: true, reason: 'ok' as const }
                : { linked: false, reason: 'unknown-user' as const }
        } catch (err) {
            // El id lo tipea una persona: que choque con otra cuenta es un error
            // de entrada esperable, no una falla. El resto sí se propaga.
            if ((err as { code?: number }).code === 11000) {
                return { linked: false, reason: 'already-taken' as const }
            }
            appLogger.error('[link-discord] failed to link discord id', { err })
            throw err
        }
    },
})
