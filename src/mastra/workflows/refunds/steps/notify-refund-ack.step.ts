import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listRefundsSubscribers } from '../../../lib/refunds-subscribers'
import { refundsStateSchema } from '../schemas/refunds-state.schema'

export const notifyRefundAckStep = createStep({
    id: 'notify-refund-ack',
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
                        kind: 'refund-acknowledged',
                        priority: 'medium',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: el reembolso del pedido ${state.orderId ?? 'sin especificar'} fue recibido por el procesador de pagos.`,
                        payload: {
                            orderId: state.orderId,
                            amount: state.amount,
                        },
                    },
                    { resourceId, threadId },
                )
            }
        }

        await setState({
            ...state,
            status: 'ack_notified',
            ackNotifiedAt: new Date().toISOString(),
        })

        return {}
    },
})
