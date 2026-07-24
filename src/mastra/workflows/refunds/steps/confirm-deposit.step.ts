import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { yearMonthFromRunId } from '../../../lib/date-scope'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'
import { depositConfirmedEmail } from '../../../lib/mailer/templates/refunds'
import { nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'

export const confirmDepositStep = createStep({
    id: 'confirm-deposit',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState, runId }) => {
        const { subject, text } = depositConfirmedEmail({
            depositAmount: state.depositAmount,
            depositDate: state.depositDate,
            refundReference: state.refundReference,
            yearMonth: yearMonthFromRunId(runId),
        })

        await sendEmail({ to: appConfig.REFUNDS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'deposit_confirmed',
            depositConfirmedAt: nowUnix(),
        })

        return {}
    },
})
