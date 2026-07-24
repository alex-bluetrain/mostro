import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { medsWorkflowInputSchema } from '../schemas/meds-workflow-input.schema'

export const requestMedsStep = createStep({
    id: 'request-meds',
    inputSchema: medsWorkflowInputSchema,
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    execute: async ({ inputData, state, setState }) => {
        await setState({
            ...state,
            status: 'meds_requested',
            medications: inputData.medications,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        const messagingUrl = appConfig.MEDS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    medications: inputData.medications,
                }),
            })
        } else {
            console.log('[meds-workflow] MEDS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})
