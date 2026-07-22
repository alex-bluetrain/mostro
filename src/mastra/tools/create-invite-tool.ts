import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { inviteRepository, userRepository } from '../../business/repositories'
import { getUserByResourceId } from '../../business/identity'
import { sendInviteEmail } from '../lib/invite-email'

export const createInviteTool = createTool({
    id: 'create-invite',
    description: 'Invita a una persona al bot y a la web: genera un código de un solo uso (vence en 7 días) y le manda la invitación por mail. Solo requiere el email de Google del invitado; el nombre se toma después de su perfil de Google. Solo los admins pueden usarlo.',
    inputSchema: z.object({
        email: z.email().describe('Email de Google del invitado (su identidad canónica)'),
    }),
    outputSchema: z.object({
        ok: z.boolean(),
        link: z.string().optional(),
        expiresAt: z.number().optional(),
        emailSent: z.boolean().optional(),
        error: z.string().optional(),
    }),
    execute: async (input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const caller = await getUserByResourceId(resourceId)
        if (!caller || caller.role !== 'admin') {
            return { ok: false, error: 'only admins can create invites' }
        }
        const existing = await userRepository.findByEmail(input.email)
        if (existing?.telegramId) {
            return { ok: false, error: 'that email already belongs to an active user' }
        }
        const invite = await inviteRepository.create({ createdBy: caller.email, email: input.email })
        const link = `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${invite.code}`
        const sent = await sendInviteEmail({ to: invite.email, link })
        return {
            ok: true,
            link,
            expiresAt: invite.expiresAt,
            emailSent: sent.ok,
            ...(sent.ok ? {} : { error: `invite created but email failed (${sent.error}): reenviá el link a mano` }),
        }
    },
})
