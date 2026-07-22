import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { subscriberRepository } from '../../../../business/repositories'
import { formatUnixDate, nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { notifyDepositOutputSchema } from '../schemas/notify-deposit-output.schema'

export const notifyDepositStep = createStep({
    id: 'notify-deposit',
    inputSchema: z.object({}),
    outputSchema: notifyDepositOutputSchema,
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const subscribers = await subscriberRepository.list('refunds')

        const supervisor = mastra?.getAgent('mostroSupervisor')
        if (supervisor) {
            for (const { resourceId, threadId } of subscribers) {
                await supervisor.sendNotificationSignal(
                    {
                        source: 'refunds',
                        kind: 'deposit-confirmed',
                        priority: 'high',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: el reembolso se depositó (${state.depositAmount ?? 'sin especificar'}) el ${state.depositDate != null ? formatUnixDate(state.depositDate) : 'fecha sin especificar'}.`,
                        payload: {
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
            notifiedAt: nowUnix(),
            notifiedCount: subscribers.length,
        })

        return { notifiedCount: subscribers.length }
    },
})
