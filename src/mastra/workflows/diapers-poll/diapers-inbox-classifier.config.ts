import { appConfig } from '@config/app.config'
import { toHandleResult, type InboxClassifierConfig } from '@lib/inbox-classifier/inbox-classifier'
import { confirmDiapersDate } from '@lib/diapers-run'
import { waitDiapersConfirmationResumeSchema } from '../diapers/schemas/wait-diapers-confirmation-resume.schema'

// Config del dominio: solo describe qué mails importan y qué hacer con cada outcome. No
// se instancia el InboxClassifier acá (ver steps/poll-diapers-mailbox.step.ts) porque el `mastra` real
// todavía no existe cuando este módulo se evalúa.
export const diapersInboxClassifierConfig: InboxClassifierConfig = {
    queryDescription: `mails del proveedor de pañales (${appConfig.DIAPERS_EMAIL_TO}) de los últimos 30 días`,
    outcomes: [
        {
            label: 'mostro/diapers/confirmacion',
            classification: { description: 'la confirmación del pedido de pañales, con la fecha de entrega, la cantidad y el domicilio' },
            extraction: {
                instructions: 'Extraé la fecha de entrega, la cantidad de pañales y el domicilio de entrega.',
                schema: waitDiapersConfirmationResumeSchema,
            },
            handle: async ({ mastra, yearMonth, data }) => {
                const { deliveryDate, deliveryAddress, quantity } = waitDiapersConfirmationResumeSchema.parse(data)
                return toHandleResult(await confirmDiapersDate(mastra, { deliveryDate, deliveryAddress, quantity, yearMonth }))
            },
        },
        {
            label: 'mostro/diapers/otro',
            classification: { description: 'catch-all: cualquier otro mail del proveedor que no encaje en el anterior' },
        },
    ],
}
