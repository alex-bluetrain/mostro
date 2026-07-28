import { appConfig } from '@config/app.config'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from '@lib/refunds-run'
import { createPollStep, toResumeResult } from '@lib/inbox/poll-step'
import type { PollConfig } from '@lib/inbox/poll-mailbox'
import { waitDepositResumeSchema } from '../../refunds/schemas/wait-deposit-resume.schema'
import { waitRefundAckResumeSchema } from '../../refunds/schemas/wait-refund-ack-resume.schema'
import { waitRefundConfirmationResumeSchema } from '../../refunds/schemas/wait-refund-confirmation-resume.schema'
import { getRefundsRunId } from '../../refunds/utils/refunds.utils'

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

export const pollRefundsMailbox = createPollStep('poll-refunds-mailbox', config)
