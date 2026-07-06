import { z } from 'zod'

export const notifyMedsConfirmationOutputSchema = z.object({ notifiedCount: z.number() })
