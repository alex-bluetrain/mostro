import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listRefundsSubscribers } from '../../../lib/refunds-subscribers'
import { nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'

export const notifyRefundConfirmationStep = createStep({
    id: 'notify-refund-confirmation',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const subscribers = await listRefundsSubscribers()

        const supervisor = mastra?.getAgent('mostroSupervisor')
        if (supervisor) {
            for (const { resourceId, threadId } of subscribers) {
                await supervisor.sendNotificationSignal(
                    {
                        source: 'refunds',
                        kind: 'refund-confirmed',
                        priority: 'medium',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: el reembolso fue confirmado (referencia ${state.refundReference ?? 'sin especificar'}).`,
                        payload: {
                            amount: state.amount,
                            refundReference: state.refundReference,
                        },
                    },
                    { resourceId, threadId },
                )
            }
        }

        await setState({
            ...state,
            status: 'confirmation_notified',
            confirmationNotifiedAt: nowUnix(),
        })

        return {}
    },
})
