import { createWorkflow } from '@mastra/core/workflows'
import { refundsStateSchema } from './schemas/refunds-state.schema'
import { requestRefundInputSchema } from './schemas/request-refund-input.schema'
import { notifyDepositOutputSchema } from './schemas/notify-deposit-output.schema'
import { requestRefundStep } from './steps/request-refund.step'
import { waitRefundAckStep } from './steps/wait-refund-ack.step'
import { notifyRefundAckStep } from './steps/notify-refund-ack.step'
import { waitRefundConfirmationStep } from './steps/wait-refund-confirmation.step'
import { notifyRefundConfirmationStep } from './steps/notify-refund-confirmation.step'
import { waitDepositStep } from './steps/wait-deposit.step'
import { confirmDepositStep } from './steps/confirm-deposit.step'
import { notifyDepositStep } from './steps/notify-deposit.step'

export const refundsWorkflow = createWorkflow({
    id: 'refunds-workflow',
    inputSchema: requestRefundInputSchema,
    outputSchema: notifyDepositOutputSchema,
    stateSchema: refundsStateSchema,
})
    .then(requestRefundStep)
    .then(waitRefundAckStep)
    .then(notifyRefundAckStep)
    .then(waitRefundConfirmationStep)
    .then(notifyRefundConfirmationStep)
    .then(waitDepositStep)
    .then(confirmDepositStep)
    .then(notifyDepositStep)
    .commit()
