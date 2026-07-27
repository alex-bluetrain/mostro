import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { getUserByResourceId } from '../../business/identity'
import { retryFailedMails } from '../lib/inbox/retry-failed-mails'

export const retryDiapersFailedMailTool = createTool({
    id: 'retry-diapers-failed-mail',
    description: 'Vuelve a poner en cola los mails del proveedor de pañales que no se pudieron procesar, para que el próximo ciclo los reintente. Solo los admins pueden usarlo. Reintentar sirve si el motivo del fallo ya se resolvió (por ejemplo, si faltaba abrir el pedido del mes).',
    inputSchema: z.object({}),
    outputSchema: z.object({
        ok: z.boolean(),
        retried: z.number().optional(),
        error: z.string().optional(),
    }),
    execute: async (_input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const caller = await getUserByResourceId(resourceId)
        if (!caller || caller.role !== 'admin') {
            return { ok: false, error: 'only admins can retry failed mails' }
        }
        return { ok: true, retried: await retryFailedMails(appConfig.DIAPERS_EMAIL_TO) }
    },
})
