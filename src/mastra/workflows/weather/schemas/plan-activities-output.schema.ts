import { z } from 'zod'

export const planActivitiesOutputSchema = z.object({
    activities: z.string(),
})
