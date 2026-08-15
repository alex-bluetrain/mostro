import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { monthOfIsoDate } from '@lib/date-scope'
import { acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { waitMedsConfirmationResumeSchema } from '../meds/schemas/wait-meds-confirmation-resume.schema'

// Estos labels DEBEN coincidir con los del JSON de reglas seedeado en Mongo. Un label
// clasificado sin handler acá se marca outcome.completed sin side effects.
const MEDS_ACKNOWLEDGED = 'meds.acknowledged'
const MEDS_DELIVERED = 'meds.delivered'

export const medsOutcomeHandlers: OutcomeHandlers = {
    [MEDS_ACKNOWLEDGED]: async ({ mastra, year, month }) =>
        toHandleResult(await acknowledgeMedsOrder(mastra, year, month)),
    [MEDS_DELIVERED]: async ({ mastra, year, data }) => {
        const { deliveryDate, deliveryAddress } = waitMedsConfirmationResumeSchema.parse(data)
        // Mismo criterio que diapers: mes de la entrega, año del contexto.
        return toHandleResult(await confirmMedsDelivery(mastra, {
            deliveryDate,
            deliveryAddress,
            year,
            month: monthOfIsoDate(deliveryDate),
        }))
    },
}
