import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '@config/app.config'
import { yearMonthFromRunId } from '@lib/date-scope'
import { sendEmail } from '@lib/mailer/gmail-mailer'
import { refundRequestEmail } from '@lib/mailer/templates/refunds'
import { nowUnix } from '@lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { requestRefundInputSchema } from '../schemas/request-refund-input.schema'

export const requestRefundStep = createStep({
    id: 'request-refund',
    inputSchema: requestRefundInputSchema,
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ inputData, state, setState, runId }) => {
        // Primero el correo: si falla, el estado no avanza y el pedido se puede reintentar limpio.
        const { subject, text } = refundRequestEmail({
            amount: inputData.amount,
            reason: inputData.reason,
            requestedBy: inputData.requestedBy,
            yearMonth: yearMonthFromRunId(runId),
        })

        await sendEmail({ to: appConfig.REFUNDS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'refund_requested',
            amount: inputData.amount,
            reason: inputData.reason,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        return {}
    },
})
