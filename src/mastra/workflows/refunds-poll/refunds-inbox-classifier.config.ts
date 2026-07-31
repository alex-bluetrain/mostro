import { appConfig } from '@config/app.config'
import { toHandleResult, type InboxClassifierConfig } from '@lib/inbox-classifier/inbox-classifier'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from '@lib/refunds-run'
import { waitDepositResumeSchema } from '../refunds/schemas/wait-deposit-resume.schema'
import { waitRefundConfirmationResumeSchema } from '../refunds/schemas/wait-refund-confirmation-resume.schema'

// Config del dominio: solo describe qué mails importan y qué hacer con cada outcome. No
// se instancia el InboxClassifier acá (ver steps/poll-refunds-mailbox.step.ts) porque el `mastra` real
// todavía no existe cuando este módulo se evalúa.
export const refundsInboxClassifierConfig: InboxClassifierConfig = {
    queryDescription: `mails del área de reintegros (${appConfig.REFUNDS_EMAIL_TO}) de los últimos 30 días`,
    outcomes: [
        {
            label: 'mostro/refunds/acuse',
            classification: { description: 'un acuse de recibo de la solicitud de reintegro, sin resolución todavía' },
            handle: async ({ mastra, yearMonth }) =>
                toHandleResult(await acknowledgeRefund(mastra, yearMonth)),
        },
        {
            label: 'mostro/refunds/aprobacion',
            classification: { description: 'la confirmación de que el reintegro fue aprobado, con su número de referencia' },
            extraction: {
                instructions: 'Extraé el número o código de referencia del reintegro.',
                schema: waitRefundConfirmationResumeSchema,
            },
            handle: async ({ mastra, yearMonth, data }) => {
                const { refundReference } = waitRefundConfirmationResumeSchema.parse(data)
                return toHandleResult(await confirmRefund(mastra, { refundReference, yearMonth }))
            },
        },
        {
            label: 'mostro/refunds/deposito',
            classification: { description: 'el aviso de que el dinero del reintegro fue depositado, con el monto y la fecha' },
            extraction: {
                instructions: 'Extraé el monto depositado y la fecha del depósito.',
                schema: waitDepositResumeSchema,
            },
            handle: async ({ mastra, yearMonth, data }) => {
                const { depositAmount, depositDate } = waitDepositResumeSchema.parse(data)
                return toHandleResult(await receiveDeposit(mastra, { depositAmount, depositDate, yearMonth }))
            },
        },
        {
            label: 'mostro/refunds/otro',
            classification: { description: 'catch-all: cualquier otro mail del área de reintegros que no encaje en los anteriores' },
        },
    ],
}
