import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listMedsSubscribers } from '../../../lib/meds-subscribers'
import { formatUnixDate, nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { notifyMedsConfirmationOutputSchema } from '../schemas/notify-meds-confirmation-output.schema'

export const notifyMedsConfirmationStep = createStep({
    id: 'notify-meds-confirmation',
    inputSchema: z.object({}),
    outputSchema: notifyMedsConfirmationOutputSchema,
    stateSchema: medsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const subscribers = await listMedsSubscribers()

        const supervisor = mastra?.getAgent('mostroSupervisor')
        if (supervisor) {
            for (const { resourceId, threadId } of subscribers) {
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
                    { resourceId, threadId },
                )
            }
        }

        await setState({
            ...state,
            status: 'meds_notification_sent',
            notifiedAt: nowUnix(),
            notifiedCount: subscribers.length,
        })

        return { notifiedCount: subscribers.length }
    },
})
