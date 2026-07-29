import { appConfig } from '@config/app.config'
import { acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { createPollStep, toResumeResult } from '@lib/inbox/poll-step'
import type { PollConfig } from '@lib/inbox/poll-mailbox'
import { notifyMailFailure } from '@lib/inbox/notify-mail-failure'
import { waitMedsAcknowledgeResumeSchema } from '../../meds/schemas/wait-meds-acknowledge-resume.schema'
import { waitMedsConfirmationResumeSchema } from '../../meds/schemas/wait-meds-confirmation-resume.schema'
import { getMedsRunId } from '../../meds/utils/meds.utils'

const config: PollConfig = {
    domain: 'meds',
    query: `from:${appConfig.MEDS_EMAIL_TO}`,
    matches: message => message.from === appConfig.MEDS_EMAIL_TO.toLowerCase(),
    onFailure: (mastra, failure) => notifyMailFailure(mastra, { domain: 'meds', ...failure }),
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

export const pollMedsMailbox = createPollStep('poll-meds-mailbox', config)
