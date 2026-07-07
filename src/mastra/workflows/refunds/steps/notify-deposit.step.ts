import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listRefundsSubscribers } from '../../../lib/refunds-subscribers'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { notifyDepositOutputSchema } from '../schemas/notify-deposit-output.schema'

export const notifyDepositStep = createStep({
    id: 'notify-deposit',
    inputSchema: z.object({}),
    outputSchema: notifyDepositOutputSchema,
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const subscribers = await listRefundsSubscribers()

        const supervisor = mastra?.getAgent('mostroSupervisor')
        if (supervisor) {
            for (const { resourceId, threadId } of subscribers) {
                await supervisor.sendNotificationSignal(
                    {
                        source: 'refunds',
                        kind: 'deposit-confirmed',
                        priority: 'high',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: el reembolso del pedido ${state.orderId ?? 'sin especificar'} se depositó (${state.depositAmount ?? 'sin especificar'}) el ${state.depositDate ?? 'fecha sin especificar'}.`,
                        payload: {
                            orderId: state.orderId,
                            depositAmount: state.depositAmount,
                            depositDate: state.depositDate,
                        },
                    },
                    { resourceId, threadId },
                )
            }
        }

        await setState({
            ...state,
            status: 'refunds_notification_sent',
            notifiedAt: new Date().toISOString(),
            notifiedCount: subscribers.length,
        })

        return { notifiedCount: subscribers.length }
    },
})
