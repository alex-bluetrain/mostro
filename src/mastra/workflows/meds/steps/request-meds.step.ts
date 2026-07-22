import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'

export const requestMedsStep = createStep({
    id: 'request-meds',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    execute: async ({ state, setState }) => {
        await setState({
            ...state,
            status: 'meds_requested',
            requestedAt: nowUnix(),
        })

        const messagingUrl = appConfig.MEDS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    medications: state.medications,
                }),
            })
        } else {
            console.log('[meds-workflow] MEDS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})
