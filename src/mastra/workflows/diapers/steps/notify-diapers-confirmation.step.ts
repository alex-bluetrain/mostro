import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listSubscribers } from '../../../lib/diapers-subscribers'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { notifyUsersOutputSchema } from '../schemas/notify-users-output.schema'

export const notifyDiapersConfirmation = createStep({
    id: 'notify-users',
    inputSchema: z.object({}),
    outputSchema: notifyUsersOutputSchema,
    stateSchema: diapersStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const subscribers = await listSubscribers()

        const supervisor = mastra?.getAgent('mostroSupervisor')
        if (supervisor) {
            for (const { resourceId, threadId } of subscribers) {
                await supervisor.sendNotificationSignal(
                    {
                        source: 'diapers',
                        kind: 'diapers-confirmation',
                        priority: 'high',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: los pañales (${state.diaperType ?? 'sin especificar'}) llegan el ${state.deliveryDate ?? 'fecha a confirmar'}.`,
                        payload: {
                            diaperType: state.diaperType,
                            quantity: state.quantity,
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
            status: 'diapers_notification_sent',
            notifiedAt: new Date().toISOString(),
            notifiedCount: subscribers.length,
        })

        return { notifiedCount: subscribers.length }
    },
})
