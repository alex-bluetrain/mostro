import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { waitMedsAcknowledgeResumeSchema } from '../schemas/wait-meds-acknowledge-resume.schema'

export const waitMedsAcknowledgeStep = createStep({
    id: 'wait-meds-acknowledge',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    resumeSchema: waitMedsAcknowledgeResumeSchema,
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'meds_acknowledged',
            acknowledgedAt: nowUnix(),
        })

        return {}
    },
})
