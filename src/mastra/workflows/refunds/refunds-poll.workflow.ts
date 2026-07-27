import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../config/app.config'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from '../../lib/refunds-run'
import { createPollStep, pollOutputSchema, toResumeResult } from '../../lib/inbox/poll-step'
import type { PollConfig } from '../../lib/inbox/poll-mailbox'
import { waitDepositResumeSchema } from './schemas/wait-deposit-resume.schema'
import { waitRefundAckResumeSchema } from './schemas/wait-refund-ack-resume.schema'
import { waitRefundConfirmationResumeSchema } from './schemas/wait-refund-confirmation-resume.schema'
import { getRefundsRunId } from './utils/refunds.utils'

const config: PollConfig = {
    domain: 'refunds',
    sender: appConfig.REFUNDS_EMAIL_TO,
    workflowId: 'refundsWorkflow',
    getRunId: getRefundsRunId,
    steps: {
        'wait-refund-ack': {
            schema: waitRefundAckResumeSchema,
            description: 'un acuse de recibo del pedido de reembolso, sin resolución todavía',
            resume: async (mastra, _data, yearMonth) =>
                toResumeResult(await acknowledgeRefund(mastra as never, yearMonth)),
        },
        'wait-refund-confirmation': {
            schema: waitRefundConfirmationResumeSchema,
            description: 'la confirmación de que el reembolso fue aprobado, con su número de referencia',
            resume: async (mastra, data, yearMonth) => toResumeResult(await confirmRefund(mastra as never, {
                refundReference: data.refundReference as string,
                yearMonth,
            })),
        },
        'wait-deposit': {
            schema: waitDepositResumeSchema,
            description: 'el aviso de que el dinero del reembolso fue depositado, con el monto y la fecha',
            resume: async (mastra, data, yearMonth) => toResumeResult(await receiveDeposit(mastra as never, {
                depositAmount: data.depositAmount as number,
                depositDate: data.depositDate as string,
                yearMonth,
            })),
        },
    },
}

export const refundsPollWorkflow = createWorkflow({
    id: 'refunds-poll',
    inputSchema: z.object({}),
    outputSchema: pollOutputSchema,
    schedule: {
        // Desfasado de diapers (2,17,32,47) y meds (7,22,37,52): sigue siendo cada 15
        // minutos, pero así los tres dominios no golpean la API de Gmail en el mismo
        // instante.
        cron: '12,27,42,57 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(createPollStep('poll-refunds-mailbox', config))
    .commit()
