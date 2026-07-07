import { z } from 'zod'

export const waitRefundConfirmationResumeSchema = z.object({
    // Referencia de confirmación que envía el procesador de pagos por webhook
    refundReference: z.string(),
})
