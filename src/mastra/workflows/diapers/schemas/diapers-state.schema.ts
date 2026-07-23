import { z } from 'zod'
import { unixTimestampSchema } from '../../../lib/unix-time'

export const diapersStateSchema = z.object({
    status: z.enum([
        'idle',
        'diapers_requested',
        'diapers_date_confirmed',
        'diapers_notification_sent',
    ]).default('idle'),
    size: z.enum(['M', 'G', 'XG']).optional(),
    quantity: z.number().optional(),
    requestedBy: z.string().optional(),
    deliveryDate: unixTimestampSchema.optional(),
    deliveryAddress: z.string().optional(),
    requestedAt: unixTimestampSchema.optional(),
    notifiedAt: unixTimestampSchema.optional(),
    notifiedCount: z.number().optional(),
})
