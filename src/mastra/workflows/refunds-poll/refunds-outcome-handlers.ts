import { toHandleResult, type OutcomeHandlers } from '@lib/outcome-processor/outcome-processor'
import { monthOfIsoDate } from '@lib/date-scope'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from '@lib/refunds-run'
import { waitDepositResumeSchema } from '../refunds/schemas/wait-deposit-resume.schema'
import { waitRefundConfirmationResumeSchema } from '../refunds/schemas/wait-refund-confirmation-resume.schema'

// Estos labels DEBEN coincidir con los del JSON de reglas seedeado en Mongo. Un label
// clasificado sin handler acá se marca outcome.completed sin side effects.
const REFUNDS_ACKNOWLEDGED = 'refunds.acknowledged'
const REFUNDS_APPROVED = 'refunds.approved'
const REFUNDS_DEPOSITED = 'refunds.deposited'

export const refundsOutcomeHandlers: OutcomeHandlers = {
    [REFUNDS_ACKNOWLEDGED]: async ({ mastra, year, month }) =>
        toHandleResult(await acknowledgeRefund(mastra, year, month)),
    [REFUNDS_APPROVED]: async ({ mastra, year, month, data }) => {
        const { refundReference } = waitRefundConfirmationResumeSchema.parse(data)
        return toHandleResult(await confirmRefund(mastra, { refundReference, year, month }))
    },
    [REFUNDS_DEPOSITED]: async ({ mastra, year, data }) => {
        const { depositAmount, depositDate } = waitDepositResumeSchema.parse(data)
        // Mismo criterio que diapers: mes del depósito, año del contexto.
        return toHandleResult(await receiveDeposit(mastra, {
            depositAmount,
            depositDate,
            year,
            month: monthOfIsoDate(depositDate),
        }))
    },
}
