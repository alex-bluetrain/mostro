import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { waitPrescriptionsResumeSchema } from '../schemas/wait-prescriptions-resume.schema'

export const waitPrescriptionsStep = createStep({
    id: 'wait-prescriptions',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    resumeSchema: waitPrescriptionsResumeSchema,
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'prescriptions_received',
            medications: resumeData.medications,
            requestedBy: resumeData.requestedBy,
            prescriptionsReceivedAt: nowUnix(),
        })

        return {}
    },
})
