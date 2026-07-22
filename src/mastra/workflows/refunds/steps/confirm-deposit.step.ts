import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'

export const confirmDepositStep = createStep({
    id: 'confirm-deposit',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState }) => {
        const messagingUrl = appConfig.REFUNDS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    depositAmount: state.depositAmount,
                    depositDate: state.depositDate,
                }),
            })
        } else {
            console.log('[refunds-workflow] REFUNDS_MESSAGING_URL not set, skipping messaging call')
        }

        await setState({
            ...state,
            status: 'deposit_confirmed',
            depositConfirmedAt: nowUnix(),
        })

        return {}
    },
})
