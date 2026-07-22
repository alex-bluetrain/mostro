import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { setUserName, telegramIdFromResourceId } from '../lib/users'

export const setMyNameTool = createTool({
    id: 'set-my-name',
    description: 'Guarda o actualiza el nombre del usuario actual (cómo quiere que lo llamen). Usar cuando un usuario nuevo dice su nombre o cuando alguien pide cambiarlo.',
    inputSchema: z.object({
        name: z.string().min(1).describe('Nombre elegido por el usuario'),
    }),
    outputSchema: z.object({
        ok: z.boolean(),
    }),
    execute: async (input, context) => {
        const resourceId = context?.agent?.resourceId
        const telegramId = resourceId ? telegramIdFromResourceId(resourceId) : null
        if (!telegramId) {
            return { ok: false }
        }
        const ok = await setUserName(telegramId, input.name)
        return { ok }
    },
})
