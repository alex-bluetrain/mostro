import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { requestRefundInputSchema } from '../schemas/request-refund-input.schema'

export const requestRefundStep = createStep({
    id: 'request-refund',
    inputSchema: requestRefundInputSchema,
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ inputData, state, setState }) => {
        await setState({
            ...state,
            status: 'refund_requested',
            amount: inputData.amount,
            reason: inputData.reason,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        const messagingUrl = appConfig.REFUNDS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    amount: inputData.amount,
                    reason: inputData.reason,
                }),
            })
        } else {
            console.log('[refunds-workflow] REFUNDS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})
