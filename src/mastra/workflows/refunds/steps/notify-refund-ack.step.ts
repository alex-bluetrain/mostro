import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { subscriberRepository } from '../../../../business/repositories'
import { resolveTelegramThread } from '../../../lib/resolve-telegram-thread'
import { nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'

export const notifyRefundAckStep = createStep({
    id: 'notify-refund-ack',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const emails = await subscriberRepository.list('refunds')

        const supervisor = mastra?.getAgent('mostroSupervisor')
        let sent = 0
        if (supervisor) {
            for (const email of emails) {
                const target = await resolveTelegramThread(mastra, email)
                if (!target) {
                    console.warn(`[notify-refund-ack] no telegram thread for ${email}, skipping`)
                    continue
                }
                await supervisor.sendNotificationSignal(
                    {
                        source: 'refunds',
                        kind: 'refund-acknowledged',
                        priority: 'medium',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: el reembolso fue recibido por el procesador de pagos.`,
                        payload: {
                            amount: state.amount,
                        },
                    },
                    target,
                )
                sent++
            }
        }

        await setState({
            ...state,
            status: 'ack_notified',
            ackNotifiedAt: nowUnix(),
        })

        return {}
    },
})
