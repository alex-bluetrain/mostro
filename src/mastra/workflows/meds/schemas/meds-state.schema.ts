import { z } from 'zod'

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
