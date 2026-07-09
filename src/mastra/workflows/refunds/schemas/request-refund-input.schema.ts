import { z } from 'zod'

export const requestRefundInputSchema = z.object({
    amount: z.number(),
    reason: z.string().optional(),
})
