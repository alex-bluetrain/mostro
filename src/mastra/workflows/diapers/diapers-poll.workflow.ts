import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../config/app.config'
import { confirmDiapersDate } from '../../lib/diapers-run'
import { createPollStep, pollOutputSchema, toResumeResult } from '../../lib/inbox/poll-step'
import type { PollConfig } from '../../lib/inbox/poll-mailbox'
import { waitDiapersConfirmationResumeSchema } from './schemas/wait-diapers-confirmation-resume.schema'
import { getDiapersRunId } from './utils/diapers.utils'

const config: PollConfig = {
    domain: 'diapers',
    // El proveedor responde desde la misma casilla a la que le escribimos.
    sender: appConfig.DIAPERS_EMAIL_TO,
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

export const diapersPollWorkflow = createWorkflow({
    id: 'diapers-poll',
    inputSchema: z.object({}),
    outputSchema: pollOutputSchema,
    schedule: {
        // Desfasado de meds (7,22,37,52) y refunds (12,27,42,57): sigue siendo cada 15
        // minutos, pero así los tres dominios no golpean la API de Gmail en el mismo
        // instante.
        cron: '2,17,32,47 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(createPollStep('poll-diapers-mailbox', config))
    .commit()
