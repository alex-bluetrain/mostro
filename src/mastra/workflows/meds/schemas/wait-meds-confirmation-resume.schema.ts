import { z } from 'zod'

export const waitMedsConfirmationResumeSchema = z.object({
    // Payload del webhook de la farmacia
    deliveryDate: z.string(),
    deliveryAddress: z.string(),
})
