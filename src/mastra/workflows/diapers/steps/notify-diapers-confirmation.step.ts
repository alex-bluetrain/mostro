import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { subscriberRepository } from '../../../../business/repositories'
import { resolveTelegramThread } from '../../../lib/resolve-telegram-thread'
import { formatUnixDate, nowUnix } from '../../../lib/unix-time'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { notifyUsersOutputSchema } from '../schemas/notify-users-output.schema'

export const notifyDiapersConfirmation = createStep({
    id: 'notify-users',
    inputSchema: z.object({}),
    outputSchema: notifyUsersOutputSchema,
    stateSchema: diapersStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const emails = await subscriberRepository.list('diapers')

        const supervisor = mastra?.getAgent('mostroSupervisor')
        let sent = 0
        if (supervisor) {
            for (const email of emails) {
                const target = await resolveTelegramThread(mastra, email)
                if (!target) {
                    console.warn(`[notify-users] no telegram thread for ${email}, skipping`)
                    continue
                }
                await supervisor.sendNotificationSignal(
                    {
                        source: 'diapers',
                        kind: 'diapers-confirmation',
                        priority: 'high',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: los pañales (${state.diaperType ?? 'sin especificar'}) llegan el ${state.deliveryDate != null ? formatUnixDate(state.deliveryDate) : 'fecha a confirmar'}.`,
                        payload: {
                            diaperType: state.diaperType,
                            quantity: state.quantity,
                            deliveryDate: state.deliveryDate,
                            deliveryAddress: state.deliveryAddress,
                        },
                    },
                    target,
                )
                sent++
            }
        }

        await setState({
            ...state,
            status: 'diapers_notification_sent',
            notifiedAt: nowUnix(),
            notifiedCount: sent,
        })

        return { notifiedCount: sent }
    },
})
