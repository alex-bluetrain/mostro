import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { subscriberRepository } from '../../../../business/repositories'
import { resolveTelegramThread } from '../../../lib/resolve-telegram-thread'
import { formatUnixDate, nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { notifyMedsConfirmationOutputSchema } from '../schemas/notify-meds-confirmation-output.schema'

export const notifyMedsConfirmationStep = createStep({
    id: 'notify-meds-confirmation',
    inputSchema: z.object({}),
    outputSchema: notifyMedsConfirmationOutputSchema,
    stateSchema: medsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const emails = await subscriberRepository.list('meds')

        const supervisor = mastra?.getAgent('mostroSupervisor')
        let sent = 0
        if (supervisor) {
            for (const email of emails) {
                const target = await resolveTelegramThread(mastra, email)
                if (!target) {
                    console.warn(`[notify-meds-confirmation] no telegram thread for ${email}, skipping`)
                    continue
                }
                await supervisor.sendNotificationSignal(
                    {
                        source: 'meds',
                        kind: 'delivery-confirmed',
                        priority: 'high',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: los medicamentos (${(state.medications ?? []).join(', ') || 'sin especificar'}) llegan el ${state.deliveryDate != null ? formatUnixDate(state.deliveryDate) : 'fecha a confirmar'}.`,
                        payload: {
                            medications: state.medications,
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
            status: 'meds_notification_sent',
            notifiedAt: nowUnix(),
            notifiedCount: sent,
        })

        return { notifiedCount: sent }
    },
})
