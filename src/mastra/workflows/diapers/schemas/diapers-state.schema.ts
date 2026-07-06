import { z } from 'zod'

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
