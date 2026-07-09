import { createWorkflow } from '@mastra/core/workflows'
import { diapersStateSchema } from './schemas/diapers-state.schema'
import { requestDiapersInputSchema } from './schemas/request-diapers-input.schema'
import { notifyUsersOutputSchema } from './schemas/notify-users-output.schema'
import { requestDiapers } from './steps/request-diapers.step'
import { notifyDiapersConfirmation } from './steps/notify-diapers-confirmation.step'
import { waitDiapersConfirmation } from './steps/wait-diapers-confirmation.step'

export const diapersWorkflow = createWorkflow({
    id: 'diapers-workflow',
    inputSchema: requestDiapersInputSchema,
    outputSchema: notifyUsersOutputSchema,
    stateSchema: diapersStateSchema,
})
    .then(requestDiapers)
    .then(waitDiapersConfirmation)
    .then(notifyDiapersConfirmation)
    .commit()
