import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { createInvite } from '../lib/invites'
import { getUserByResourceId } from '../lib/users'

export const createInviteTool = createTool({
    id: 'create-invite',
    description: 'Genera un link de invitación de un solo uso (vence en 7 días) para sumar a una persona nueva al bot. Solo los admins pueden usarlo.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        ok: z.boolean(),
        link: z.string().optional(),
        expiresAt: z.number().optional(),
        error: z.string().optional(),
    }),
    execute: async (_input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const user = await getUserByResourceId(resourceId)
        if (!user || user.role !== 'admin') {
            return { ok: false, error: 'only admins can create invites' }
        }
        const invite = await createInvite(user.telegramId)
        return {
            ok: true,
            link: `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${invite.code}`,
            expiresAt: invite.expiresAt,
        }
    },
})
