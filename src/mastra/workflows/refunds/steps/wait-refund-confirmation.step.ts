import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { waitRefundConfirmationResumeSchema } from '../schemas/wait-refund-confirmation-resume.schema'

export const waitRefundConfirmationStep = createStep({
    id: 'wait-refund-confirmation',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    resumeSchema: waitRefundConfirmationResumeSchema,
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'refund_confirmed',
            refundReference: resumeData.refundReference,
            confirmedAt: new Date().toISOString(),
        })

        return {}
    },
})
