import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listMedsSubscribers } from '../../../lib/meds-subscribers'
import { nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'

export const notifyMedsAckStep = createStep({
    id: 'notify-meds-ack',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const subscribers = await listMedsSubscribers()

        const supervisor = mastra?.getAgent('mostroSupervisor')
        if (supervisor) {
            for (const { resourceId, threadId } of subscribers) {
                await supervisor.sendNotificationSignal(
                    {
                        source: 'meds',
                        kind: 'order-acknowledged',
                        priority: 'medium',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: la farmacia recibió el pedido de medicamentos (${(state.medications ?? []).join(', ') || 'sin especificar'}).`,
                        payload: {
                            medications: state.medications,
                        },
                    },
                    { resourceId, threadId },
                )
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
