import { z } from 'zod'
import { unixTimestampSchema } from '@lib/unix-time'

export const diapersStateSchema = z.object({
    status: z.enum([
        'idle',
        'diapers_requested',
        'diapers_date_confirmed',
        'diapers_notification_sent',
    ]).default('idle'),
    // El mes del pedido: lo fija quien arranca el run y queda en el estado, así los steps no
    // tienen que parsearlo del run id.
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    size: z.enum(['M', 'G', 'XG']).optional(),
    quantity: z.number().optional(),
    requestedBy: z.string().min(1),
    deliveryDate: unixTimestampSchema.optional(),
    deliveryAddress: z.string().optional(),
    requestedAt: unixTimestampSchema.optional(),
    notifiedAt: unixTimestampSchema.optional(),
    notifiedCount: z.number().optional(),
})
