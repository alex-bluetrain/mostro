import { createWorkflow } from '@mastra/core/workflows'
import { medsStateSchema } from './schemas/meds-state.schema'
import { medsWorkflowInputSchema } from './schemas/meds-workflow-input.schema'
import { notifyMedsConfirmationOutputSchema } from './schemas/notify-meds-confirmation-output.schema'
import { waitPrescriptionsStep } from './steps/wait-prescriptions.step'
import { requestMedsStep } from './steps/request-meds.step'
import { waitMedsAcknowledgeStep } from './steps/wait-meds-acknowledge.step'
import { notifyMedsAckStep } from './steps/notify-meds-ack.step'
import { waitMedsConfirmationStep } from './steps/wait-meds-confirmation.step'
import { notifyMedsConfirmationStep } from './steps/notify-meds-confirmation.step'

export const medsWorkflow = createWorkflow({
    id: 'meds-workflow',
    inputSchema: medsWorkflowInputSchema,
    outputSchema: notifyMedsConfirmationOutputSchema,
    stateSchema: medsStateSchema,
})
    .then(waitPrescriptionsStep)
    .then(requestMedsStep)
    .then(waitMedsAcknowledgeStep)
    .then(notifyMedsAckStep)
    .then(waitMedsConfirmationStep)
    .then(notifyMedsConfirmationStep)
    .commit()
