import { z } from 'zod'

export const waitDiapersConfirmationResumeSchema = z.object({
    // Payload del webhook de la farmacia: la farmacia nos indica la cantidad al confirmar
    deliveryDate: z.string(),
    deliveryAddress: z.string(),
    quantity: z.number(),
})
