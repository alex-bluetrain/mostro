import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { monthOfIsoDate } from '@lib/date-scope'
import { confirmDiapersDate } from '@lib/diapers-run'
import { waitDiapersConfirmationResumeSchema } from '../diapers/schemas/wait-diapers-confirmation-resume.schema'

// Estos labels DEBEN coincidir con los del JSON de reglas seedeado en Mongo. Un label
// clasificado sin handler acá se marca outcome.completed sin side effects.
const DIAPERS_CONFIRMED = 'diapers.confirmed'

export const diapersOutcomeHandlers: OutcomeHandlers = {
    [DIAPERS_CONFIRMED]: async ({ mastra, year, data }) => {
        const { deliveryDate, deliveryAddress, quantity } = waitDiapersConfirmationResumeSchema.parse(data)
        // El mes del pedido es el de la entrega, no el del mail: una confirmación puede llegar
        // como respuesta tardía a un thread viejo. El año sale del contexto porque el LLM le
        // puede errar cuando el mail no lo escribe.
        return toHandleResult(await confirmDiapersDate(mastra, {
            deliveryDate,
            deliveryAddress,
            quantity,
            year,
            month: monthOfIsoDate(deliveryDate),
        }))
    },
}
