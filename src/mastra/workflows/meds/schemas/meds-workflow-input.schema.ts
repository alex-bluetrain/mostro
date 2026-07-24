import { z } from 'zod'

export const medsWorkflowInputSchema = z.object({
    medications: z.array(z.string()),
    requestedBy: z.string().min(1),
})
