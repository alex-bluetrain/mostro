import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { confirmDiapersDate } from '@lib/diapers-run'
import { waitDiapersConfirmationResumeSchema } from '../diapers/schemas/wait-diapers-confirmation-resume.schema'

// Estos labels DEBEN coincidir con los del JSON de reglas seedeado en Mongo. Un label
// clasificado sin handler acá se marca outcome.completed sin side effects.
const DIAPERS_CONFIRMED = 'diapers.confirmed'

export const diapersOutcomeHandlers: OutcomeHandlers = {
    [DIAPERS_CONFIRMED]: async ({ mastra, yearMonth, data }) => {
        const { deliveryDate, deliveryAddress, quantity } = waitDiapersConfirmationResumeSchema.parse(data)
        return toHandleResult(await confirmDiapersDate(mastra, { deliveryDate, deliveryAddress, quantity, yearMonth }))
    },
}
