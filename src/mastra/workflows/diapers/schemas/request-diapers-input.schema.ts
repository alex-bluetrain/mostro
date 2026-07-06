import { z } from 'zod'

export const requestDiapersInputSchema = z.object({
    diaperType: z.string(),
    quantity: z.number(),
})
