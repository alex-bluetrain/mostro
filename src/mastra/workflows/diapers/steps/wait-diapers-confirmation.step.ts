import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { toUnix } from '../../../lib/unix-time'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { waitDiapersConfirmationResumeSchema } from '../schemas/wait-diapers-confirmation-resume.schema'

export const waitDiapersConfirmation = createStep({
    id: 'wait-diapers-confirmation',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: diapersStateSchema,
    resumeSchema: waitDiapersConfirmationResumeSchema,
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'diapers_date_confirmed',
            deliveryDate: toUnix(resumeData.deliveryDate),
            deliveryAddress: resumeData.deliveryAddress,
            quantity: resumeData.quantity,
        })

        return {}
    },
})
