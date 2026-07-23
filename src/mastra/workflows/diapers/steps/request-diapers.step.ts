import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { nowUnix } from '../../../lib/unix-time'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { requestDiapersInputSchema } from '../schemas/request-diapers-input.schema'

export const requestDiapers = createStep({
    id: 'request-diapers',
    inputSchema: requestDiapersInputSchema,
    outputSchema: z.object({}),
    stateSchema: diapersStateSchema,
    execute: async ({ inputData, state, setState }) => {
        await setState({
            ...state,
            status: 'diapers_requested',
            size: inputData.size,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        const messagingUrl = appConfig.DIAPERS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    size: inputData.size,
                }),
            })
        } else {
            console.log('[diapers-workflow] DIAPERS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})
