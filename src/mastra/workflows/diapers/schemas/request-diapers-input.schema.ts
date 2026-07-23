import { z } from 'zod'

export const requestDiapersInputSchema = z.object({
    size: z.enum(['M', 'G', 'XG']),
    requestedBy: z.string().optional(),
})
