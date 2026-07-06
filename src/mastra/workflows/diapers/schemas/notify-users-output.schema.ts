import { z } from 'zod'

export const notifyUsersOutputSchema = z.object({ notifiedCount: z.number() })
