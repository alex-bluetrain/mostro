import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { inviteRepository } from '../../business/repositories'
import { getUserByResourceId } from '../../business/identity'

export const createInviteTool = createTool({
    id: 'create-invite',
    description: 'Genera un link de invitación de un solo uso (vence en 7 días) para sumar a una persona al bot y a la web. Requiere el email de Google del invitado; el nombre es opcional. Solo los admins pueden usarlo.',
    inputSchema: z.object({
        email: z.email().describe('Email de Google del invitado (su identidad canónica)'),
        name: z.string().min(1).optional().describe('Nombre del invitado, si se sabe'),
    }),
    outputSchema: z.object({
        ok: z.boolean(),
        link: z.string().optional(),
        expiresAt: z.number().optional(),
        error: z.string().optional(),
    }),
    execute: async (input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const user = await getUserByResourceId(resourceId)
        if (!user || user.role !== 'admin') {
            return { ok: false, error: 'only admins can create invites' }
        }
        const invite = await inviteRepository.create({ createdBy: user.email, email: input.email, name: input.name })
        return {
            ok: true,
            link: `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${invite.code}`,
            expiresAt: invite.expiresAt,
        }
    },
})
