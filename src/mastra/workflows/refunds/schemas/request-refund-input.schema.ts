import { z } from 'zod'

export const requestRefundInputSchema = z.object({
    orderId: z.string(),
    amount: z.number(),
    reason: z.string().optional(),
})
