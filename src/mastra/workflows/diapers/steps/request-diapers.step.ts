import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { requestDiapersInputSchema } from '../schemas/request-diapers-input.schema'

export const requestDiapersStep = createStep({
    id: 'request-diapers',
    inputSchema: requestDiapersInputSchema,
    outputSchema: z.object({}),
    stateSchema: diapersStateSchema,
    execute: async ({ inputData, state, setState }) => {
        await setState({
            ...state,
            status: 'diapers_requested',
            diaperType: inputData.diaperType,
            quantity: inputData.quantity,
            requestedAt: new Date().toISOString(),
        })

        const messagingUrl = appConfig.DIAPERS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    type: inputData.diaperType,
                    quantity: inputData.quantity,
                }),
            })
        } else {
            console.log('[diapers-workflow] DIAPERS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})
