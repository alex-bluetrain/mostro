import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '@config/app.config'
import { getUserByResourceId } from '@business/identity'
import { retryFailedMails } from '@lib/inbox/retry-failed-mails'

export const retryMedsFailedMailTool = createTool({
    id: 'retry-meds-failed-mail',
    description: 'Vuelve a poner en cola los mails de la farmacia que no se pudieron procesar, para que el próximo ciclo los reintente. Solo los admins pueden usarlo. Reintentar sirve si el motivo del fallo ya se resolvió (por ejemplo, si faltaba abrir el pedido del mes). Si outOfWindow es mayor a cero, hay mails viejos que no se pueden reintentar automáticamente — hay que revisarlos manualmente en Gmail.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        ok: z.boolean(),
        retried: z.number().optional(),
        outOfWindow: z.number().optional(),
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
        const result = await retryFailedMails(appConfig.MEDS_EMAIL_TO)
        return { ok: true, retried: result.retried, outOfWindow: result.outOfWindow }
    },
})
