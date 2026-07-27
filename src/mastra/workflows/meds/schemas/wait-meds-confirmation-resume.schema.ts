import { z } from 'zod'

// Ídem wait-diapers-confirmation-resume.schema.ts: este contrato ya no lo llena solo un
// webhook confiable, sino también una extracción de LLM. El regex evita que una fecha
// mal formateada llegue a toUnix() y deje el run en `failed` sin forma de reanudarlo.
export const waitMedsConfirmationResumeSchema = z.object({
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe tener el formato YYYY-MM-DD'),
    deliveryAddress: z.string(),
})
