import { z } from 'zod'

export const waitPrescriptionsResumeSchema = z.object({
    medications: z.array(z.string()),
    requestedBy: z.string().optional(),
})
