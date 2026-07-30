import { appConfig } from '@config/app.config'
import { toHandleResult, type InboxClassifierConfig } from '@lib/inbox-classifier/inbox-classifier'
import { acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { waitMedsConfirmationResumeSchema } from '../meds/schemas/wait-meds-confirmation-resume.schema'

// Config del dominio: solo describe qué mails importan y qué hacer con cada outcome. No
// se instancia el InboxClassifier acá (ver classifier-step.ts) porque el `mastra` real
// todavía no existe cuando este módulo se evalúa.
export const medsInboxClassifierConfig: InboxClassifierConfig = {
    queryDescription: `mails de la farmacia (${appConfig.MEDS_EMAIL_TO}) de los últimos 30 días`,
    outcomes: [
        {
            label: 'mostro/meds/acuse',
            description: 'un acuse de recibo del pedido de medicamentos, sin fecha de entrega todavía',
            handle: async ({ mastra, yearMonth }) =>
                toHandleResult(await acknowledgeMedsOrder(mastra, yearMonth)),
        },
        {
            label: 'mostro/meds/entrega',
            description: 'la confirmación de la entrega de los medicamentos, con la fecha y el domicilio',
            extract: waitMedsConfirmationResumeSchema,
            handle: async ({ mastra, yearMonth, data }) => {
                const { deliveryDate, deliveryAddress } = waitMedsConfirmationResumeSchema.parse(data)
                return toHandleResult(await confirmMedsDelivery(mastra, { deliveryDate, deliveryAddress, yearMonth }))
            },
        },
        {
            label: 'mostro/meds/otro',
            description: 'catch-all: cualquier otro mail de la farmacia que no encaje en los anteriores',
        },
    ],
}
