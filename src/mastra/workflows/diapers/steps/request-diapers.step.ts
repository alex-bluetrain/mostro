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
            diaperType: inputData.diaperType,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        const messagingUrl = appConfig.DIAPERS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    type: inputData.diaperType,
                }),
            })
        } else {
            console.log('[diapers-workflow] DIAPERS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})
