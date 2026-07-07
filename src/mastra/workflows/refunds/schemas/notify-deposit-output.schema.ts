import { z } from 'zod'

export const notifyDepositOutputSchema = z.object({ notifiedCount: z.number() })
