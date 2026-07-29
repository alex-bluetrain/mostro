import { appConfig } from '@config/app.config'
import { confirmDiapersDate } from '@lib/diapers-run'
import { createPollStep, toResumeResult } from '@lib/inbox/poll-step'
import type { PollConfig } from '@lib/inbox/poll-mailbox'
import { notifyMailFailure } from '@lib/inbox/notify-mail-failure'
import { waitDiapersConfirmationResumeSchema } from '../../diapers/schemas/wait-diapers-confirmation-resume.schema'
import { getDiapersRunId } from '../../diapers/utils/diapers.utils'

const config: PollConfig = {
    domain: 'diapers',
    // El proveedor responde desde la misma casilla a la que le escribimos.
    query: `from:${appConfig.DIAPERS_EMAIL_TO}`,
    // El reader normaliza from con trim().toLowerCase(); alineamos la misma
    // normalización acá o un espacio de más en el env vuelve este filtro un
    // no-op permanente.
    matches: message => message.from === appConfig.DIAPERS_EMAIL_TO.trim().toLowerCase(),
    onFailure: (mastra, failure) => notifyMailFailure(mastra, { domain: 'diapers', ...failure }),
    workflowId: 'diapersWorkflow',
    getRunId: getDiapersRunId,
    steps: {
        'wait-diapers-confirmation': {
            schema: waitDiapersConfirmationResumeSchema,
            description: 'la confirmación del pedido de pañales, con la fecha de entrega, la cantidad y el domicilio',
            resume: async (mastra, data, yearMonth) => toResumeResult(await confirmDiapersDate(mastra as never, {
                deliveryDate: data.deliveryDate as string,
                deliveryAddress: data.deliveryAddress as string,
                quantity: data.quantity as number,
                yearMonth,
            })),
        },
    },
}

export const pollDiapersMailbox = createPollStep('poll-diapers-mailbox', config)
