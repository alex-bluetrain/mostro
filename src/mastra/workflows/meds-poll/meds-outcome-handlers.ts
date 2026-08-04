import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { waitMedsConfirmationResumeSchema } from '../meds/schemas/wait-meds-confirmation-resume.schema'

// Estos labels DEBEN coincidir con los del JSON de reglas seedeado en Mongo. Un label
// clasificado sin handler acá se marca outcome.completed sin side effects.
const MEDS_ACKNOWLEDGED = 'meds.acknowledged'
const MEDS_DELIVERED = 'meds.delivered'

export const medsOutcomeHandlers: OutcomeHandlers = {
    [MEDS_ACKNOWLEDGED]: async ({ mastra, yearMonth }) =>
        toHandleResult(await acknowledgeMedsOrder(mastra, yearMonth)),
    [MEDS_DELIVERED]: async ({ mastra, yearMonth, data }) => {
        const { deliveryDate, deliveryAddress } = waitMedsConfirmationResumeSchema.parse(data)
        return toHandleResult(await confirmMedsDelivery(mastra, { deliveryDate, deliveryAddress, yearMonth }))
    },
}
