import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { listMedsSubscribers } from '../lib/meds-subscribers'
import { appConfig } from '../config/app.config'

export function getMedsRunId(yearMonth: string) {
    return `meds-${yearMonth}`
}

export const medsStateSchema = z.object({
    status: z.enum([
        'idle',
        'prescriptions_received',
        'meds_requested',
        'meds_acknowledged',
        'ack_notified',
        'delivery_confirmed',
        'meds_notification_sent',
    ]).default('idle'),
    medications: z.array(z.string()).optional(),
    prescriptionsReceivedAt: z.string().optional(),
    requestedAt: z.string().optional(),
    acknowledgedAt: z.string().optional(),
    ackNotifiedAt: z.string().optional(),
    deliveryDate: z.string().optional(),
    deliveryAddress: z.string().optional(),
    notifiedAt: z.string().optional(),
    notifiedCount: z.number().optional(),
})

const waitForPrescriptionsStep = createStep({
    id: 'wait-for-prescriptions',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    resumeSchema: z.object({
        medications: z.array(z.string()),
    }),
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'prescriptions_received',
            medications: resumeData.medications,
            prescriptionsReceivedAt: new Date().toISOString(),
        })

        return {}
    },
})

const requestMedsStep = createStep({
    id: 'request-meds',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    execute: async ({ state, setState }) => {
        await setState({
            ...state,
            status: 'meds_requested',
            requestedAt: new Date().toISOString(),
        })

        const messagingUrl = appConfig.MEDS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    medications: state.medications,
                }),
            })
        } else {
            console.log('[meds-workflow] MEDS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})

const waitForMedsAcknowledgeStep = createStep({
    id: 'wait-for-meds-acknowledge',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    resumeSchema: z.object({}),
    execute: async ({ state, setState, suspend, resumeData }) => {
        if (!resumeData) {
            await suspend({})
            return {}
        }

        await setState({
            ...state,
            status: 'meds_acknowledged',
            acknowledgedAt: new Date().toISOString(),
        })

        return {}
    },
})

const notifyMedsAckStep = createStep({
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
            ackNotifiedAt: new Date().toISOString(),
        })

        return {}
    },
})

const waitForMedsConfirmationStep = createStep({
    id: 'wait-for-meds-confirmation',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
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
            status: 'delivery_confirmed',
            deliveryDate: resumeData.deliveryDate,
            deliveryAddress: resumeData.deliveryAddress,
        })

        return {}
    },
})

const notifyMedsConfirmationStep = createStep({
    id: 'notify-meds-confirmation',
    inputSchema: z.object({}),
    outputSchema: z.object({ notifiedCount: z.number() }),
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
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: los medicamentos (${(state.medications ?? []).join(', ') || 'sin especificar'}) llegan el ${state.deliveryDate ?? 'fecha a confirmar'}.`,
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
            notifiedAt: new Date().toISOString(),
            notifiedCount: subscribers.length,
        })

        return { notifiedCount: subscribers.length }
    },
})

export const medsWorkflow = createWorkflow({
    id: 'meds-workflow',
    inputSchema: z.object({}),
    outputSchema: z.object({ notifiedCount: z.number() }),
    stateSchema: medsStateSchema,
})
    .then(waitForPrescriptionsStep)
    .then(requestMedsStep)
    .then(waitForMedsAcknowledgeStep)
    .then(notifyMedsAckStep)
    .then(waitForMedsConfirmationStep)
    .then(notifyMedsConfirmationStep)
    .commit()
