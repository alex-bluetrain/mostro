import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '@config/app.config'
import { sendEmail } from '@lib/mailer/gmail-mailer'
import { diapersRequestEmail } from '@lib/mailer/templates/diapers'
import { nowUnix } from '@lib/unix-time'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { requestDiapersInputSchema } from '../schemas/request-diapers-input.schema'

export const requestDiapers = createStep({
    id: 'request-diapers',
    inputSchema: requestDiapersInputSchema,
    outputSchema: z.object({}),
    stateSchema: diapersStateSchema,
    execute: async ({ inputData, state, setState }) => {
        // Primero el correo: si falla, el estado no avanza y el pedido se puede reintentar limpio.
        const { subject, text } = diapersRequestEmail({
            size: inputData.size,
            year: state.year,
            month: state.month,
        })

        await sendEmail({ to: appConfig.DIAPERS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'diapers_requested',
            size: inputData.size,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        return {}
    },
})
