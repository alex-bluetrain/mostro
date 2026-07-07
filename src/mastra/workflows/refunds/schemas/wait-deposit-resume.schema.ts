import { z } from 'zod'

export const waitDepositResumeSchema = z.object({
    // Payload del webhook que informa que el depósito llegó a la cuenta del usuario
    depositAmount: z.number(),
    depositDate: z.string(),
})
