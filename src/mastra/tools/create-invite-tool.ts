import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { createInvite } from '@lib/invites'
import { getUserByResourceId } from '@business/identity'

export const createInviteTool = createTool({
    id: 'create-invite',
    description: 'Genera un link de invitación de un solo uso (vence en 7 días) para sumar a una persona al bot y a la web. Solo requiere el email de Google del invitado; el nombre se toma después de su perfil de Google. Solo los admins pueden usarlo.',
    inputSchema: z.object({
        email: z.email().describe('Email de Google del invitado (su identidad canónica)'),
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
        const caller = await getUserByResourceId(resourceId)
        if (!caller) {
            return { ok: false, error: 'only admins can create invites' }
        }
        return createInvite(caller, input.email)
    },
})
