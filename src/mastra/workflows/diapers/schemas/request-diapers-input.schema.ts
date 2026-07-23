import { z } from 'zod'

export const requestDiapersInputSchema = z.object({
    diaperType: z.string(),
    requestedBy: z.string().optional(),
})
