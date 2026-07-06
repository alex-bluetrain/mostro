import { createWorkflow } from '@mastra/core/workflows'
import { diapersStateSchema } from './schemas/diapers-state.schema'
import { requestDiapersInputSchema } from './schemas/request-diapers-input.schema'
import { notifyUsersOutputSchema } from './schemas/notify-users-output.schema'
import { requestDiapersStep } from './steps/request-diapers.step'
import { waitDiapersConfirmationStep } from './steps/wait-diapers-confirmation.step'
import { notifyUsersStep } from './steps/notify-users.step'

export const diapersWorkflow = createWorkflow({
    id: 'diapers-workflow',
    inputSchema: requestDiapersInputSchema,
    outputSchema: notifyUsersOutputSchema,
    stateSchema: diapersStateSchema,
})
    .then(requestDiapersStep)
    .then(waitDiapersConfirmationStep)
    .then(notifyUsersStep)
    .commit()
