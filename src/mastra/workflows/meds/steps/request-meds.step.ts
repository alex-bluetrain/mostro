import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '@config/app.config'
import { yearMonthFromRunId } from '@lib/date-scope'
import { sendEmail } from '@lib/mailer/gmail-mailer'
import { medsRequestEmail } from '@lib/mailer/templates/meds'
import { nowUnix } from '@lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { medsWorkflowInputSchema } from '../schemas/meds-workflow-input.schema'

export const requestMedsStep = createStep({
    id: 'request-meds',
    inputSchema: medsWorkflowInputSchema,
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    execute: async ({ inputData, state, setState, runId }) => {
        // Primero el correo: si falla, el estado no avanza y el pedido se puede reintentar limpio.
        const { subject, text } = medsRequestEmail({
            medications: inputData.medications,
            requestedBy: inputData.requestedBy,
            yearMonth: yearMonthFromRunId(runId),
        })

        await sendEmail({ to: appConfig.MEDS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'meds_requested',
            medications: inputData.medications,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        return {}
    },
})
