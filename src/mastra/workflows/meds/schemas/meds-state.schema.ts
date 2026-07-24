import { z } from 'zod'
import { unixTimestampSchema } from '../../../lib/unix-time'

export const medsStateSchema = z.object({
    status: z.enum([
        'idle',
        'meds_requested',
        'meds_acknowledged',
        'ack_notified',
        'delivery_confirmed',
        'meds_notification_sent',
    ]).default('idle'),
    medications: z.array(z.string()).optional(),
    requestedBy: z.string().min(1),
    requestedAt: unixTimestampSchema.optional(),
    acknowledgedAt: unixTimestampSchema.optional(),
    ackNotifiedAt: unixTimestampSchema.optional(),
    deliveryDate: unixTimestampSchema.optional(),
    deliveryAddress: z.string().optional(),
    notifiedAt: unixTimestampSchema.optional(),
    notifiedCount: z.number().optional(),
})
