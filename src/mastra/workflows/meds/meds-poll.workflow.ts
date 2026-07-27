import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../config/app.config'
import { acknowledgeMedsOrder, confirmMedsDelivery } from '../../lib/meds-run'
import { createPollStep, pollOutputSchema, toResumeResult } from '../../lib/inbox/poll-step'
import type { PollConfig } from '../../lib/inbox/poll-mailbox'
import { waitMedsAcknowledgeResumeSchema } from './schemas/wait-meds-acknowledge-resume.schema'
import { waitMedsConfirmationResumeSchema } from './schemas/wait-meds-confirmation-resume.schema'
import { getMedsRunId } from './utils/meds.utils'

const config: PollConfig = {
    domain: 'meds',
    sender: appConfig.MEDS_EMAIL_TO,
    workflowId: 'medsWorkflow',
    getRunId: getMedsRunId,
    steps: {
        // El acuse no aporta datos: su schema es vacío y el modelo solo decide si el
        // mail es un acuse. Tras reanudarlo el run vuelve a suspenderse en la etapa
        // siguiente, así que 'suspended' acá es el camino feliz.
        'wait-meds-acknowledge': {
            schema: waitMedsAcknowledgeResumeSchema,
            description: 'un acuse de recibo del pedido de medicamentos, sin fecha de entrega todavía',
            resume: async (mastra, _data, yearMonth) =>
                toResumeResult(await acknowledgeMedsOrder(mastra as never, yearMonth)),
        },
        'wait-meds-confirmation': {
            schema: waitMedsConfirmationResumeSchema,
            description: 'la confirmación de la entrega de los medicamentos, con la fecha y el domicilio',
            resume: async (mastra, data, yearMonth) => toResumeResult(await confirmMedsDelivery(mastra as never, {
                deliveryDate: data.deliveryDate as string,
                deliveryAddress: data.deliveryAddress as string,
                yearMonth,
            })),
        },
    },
}

export const medsPollWorkflow = createWorkflow({
    id: 'meds-poll',
    inputSchema: z.object({}),
    outputSchema: pollOutputSchema,
    schedule: {
        // Desfasado de diapers (2,17,32,47) y refunds (12,27,42,57): sigue siendo cada 15
        // minutos, pero así los tres dominios no golpean la API de Gmail en el mismo
        // instante.
        cron: '7,22,37,52 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(createPollStep('poll-meds-mailbox', config))
    .commit()
