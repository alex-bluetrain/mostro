import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listSubscribers } from '../lib/diapers-subscribers'
import { appConfig } from '../config/app.config'

export function getDiapersRunId(yearMonth: string) {
    return `diapers-${yearMonth}`
}

export const diapersStateSchema = z.object({
    status: z.enum([
        'idle',
        'diapers_requested',
        'diapers_date_confirmed',
        'diapers_notification_sent',
    ]).default('idle'),
    diaperType: z.string().optional(),
    quantity: z.number().optional(),
    deliveryDate: z.string().optional(),
    deliveryAddress: z.string().optional(),
    requestedAt: z.string().optional(),
    notifiedAt: z.string().optional(),
    notifiedCount: z.number().optional(),
})

const requestDiapersStep = createStep({
    id: 'request-diapers',
    inputSchema: z.object({
        diaperType: z.string(),
        quantity: z.number(),
    }),
    outputSchema: z.object({}),
    stateSchema: diapersStateSchema,
    execute: async ({ inputData, state, setState }) => {
        await setState({
            ...state,
            status: 'diapers_requested',
            diaperType: inputData.diaperType,
            quantity: inputData.quantity,
            requestedAt: new Date().toISOString(),
        })

        const messagingUrl = appConfig.DIAPERS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    type: inputData.diaperType,
                    quantity: inputData.quantity,
                }),
            })
        } else {
            console.log('[diapers-workflow] DIAPERS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})

const waitForDeliveryConfirmationStep = createStep({
    id: 'wait-for-delivery-confirmation',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: diapersStateSchema,
    resumeSchema: z.object({
        // Payload del webhook de la farmacia
        deliveryDate: z.string(),
        deliveryAddress: z.string(),
    }),
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'diapers_date_confirmed',
            deliveryDate: resumeData.deliveryDate,
            deliveryAddress: resumeData.deliveryAddress,
        })

        return {}
    },
})

const notifyRequestersStep = createStep({
    id: 'notify-requesters',
    inputSchema: z.object({}),
    outputSchema: z.object({ notifiedCount: z.number() }),
    stateSchema: diapersStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const subscribers = await listSubscribers()

        const supervisor = mastra?.getAgent('mostroSupervisor')
        if (supervisor) {
            for (const { resourceId, threadId } of subscribers) {
                await supervisor.sendNotificationSignal(
                    {
                        source: 'diapers',
                        kind: 'delivery-confirmed',
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

export const diapersWorkflow = createWorkflow({
    id: 'diapers-workflow',
    inputSchema: z.object({
        diaperType: z.string(),
        quantity: z.number(),
    }),
    outputSchema: z.object({ notifiedCount: z.number() }),
    stateSchema: diapersStateSchema,
})
    .then(requestDiapersStep)
    .then(waitForDeliveryConfirmationStep)
    .then(notifyRequestersStep)
    .commit()
