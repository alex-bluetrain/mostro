import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { waitRefundAckResumeSchema } from '../schemas/wait-refund-ack-resume.schema'

export const waitRefundAckStep = createStep({
    id: 'wait-refund-ack',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    resumeSchema: waitRefundAckResumeSchema,
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'refund_acknowledged',
            acknowledgedAt: new Date().toISOString(),
        })

        return {}
    },
})
