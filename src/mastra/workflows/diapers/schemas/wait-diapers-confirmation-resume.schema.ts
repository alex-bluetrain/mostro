import { z } from 'zod'

// Contrato de reanudación: originalmente era el payload de un webhook confiable, pero
// ahora también lo llena una extracción de LLM contra el mail de la farmacia (ver
// mail-extractor.ts). Una fecha plausible pero mal formateada ("11/03/2026") pasaría un
// z.string() suelto, toUnix() la convertiría en NaN, y el state la rechazaría con el run
// ya en `failed` (no `suspended`) — irrecuperable, porque readSuspendedStep no ve un run
// fallido. El regex hace que el modelo (con structured output estricto) la rechace antes
// de tocar el run: el mail cae a mostro-failed y el mes sobrevive intacto.
export const waitDiapersConfirmationResumeSchema = z.object({
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha debe tener el formato YYYY-MM-DD'),
    deliveryAddress: z.string(),
    quantity: z.number(),
})
