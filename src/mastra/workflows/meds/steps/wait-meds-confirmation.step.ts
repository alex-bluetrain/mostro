import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { waitMedsConfirmationResumeSchema } from '../schemas/wait-meds-confirmation-resume.schema'

export const waitMedsConfirmationStep = createStep({
    id: 'wait-meds-confirmation',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    resumeSchema: waitMedsConfirmationResumeSchema,
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'delivery_confirmed',
            deliveryDate: resumeData.deliveryDate,
            deliveryAddress: resumeData.deliveryAddress,
        })

        return {}
    },
})
