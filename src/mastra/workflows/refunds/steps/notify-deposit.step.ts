import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { subscriberRepository } from '../../../../business/repositories'
import { resolveTelegramThread } from '../../../lib/resolve-telegram-thread'
import { formatUnixDate, nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { notifyDepositOutputSchema } from '../schemas/notify-deposit-output.schema'

export const notifyDepositStep = createStep({
    id: 'notify-deposit',
    inputSchema: z.object({}),
    outputSchema: notifyDepositOutputSchema,
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const emails = await subscriberRepository.list('refunds')

        const supervisor = mastra?.getAgent('mostroSupervisor')
        let sent = 0
        if (supervisor) {
            for (const email of emails) {
                const target = await resolveTelegramThread(mastra, email)
                if (!target) {
                    console.warn(`[notify-deposit] no telegram thread for ${email}, skipping`)
                    continue
                }
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
                    target,
                )
                sent++
            }
        }

        await setState({
            ...state,
            status: 'refunds_notification_sent',
            notifiedAt: nowUnix(),
            notifiedCount: sent,
        })

        return { notifiedCount: sent }
    },
})
