import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { waitDepositResumeSchema } from '../schemas/wait-deposit-resume.schema'

export const waitDepositStep = createStep({
    id: 'wait-deposit',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    resumeSchema: waitDepositResumeSchema,
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'deposit_received',
            depositAmount: resumeData.depositAmount,
            depositDate: resumeData.depositDate,
            depositReceivedAt: new Date().toISOString(),
        })

        return {}
    },
})
