import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { classifierOutputSchema } from '@lib/inbox-classifier/classifier-step'
import { pollDiapersMailbox } from './steps/poll-diapers-mailbox.step'

export const diapersPollWorkflow = createWorkflow({
    id: 'diapers-poll',
    inputSchema: z.object({}),
    outputSchema: classifierOutputSchema,
    schedule: {
        // Desfasado de meds (7,22,37,52) y refunds (12,27,42,57): sigue siendo cada 15
        // minutos, pero así los tres dominios no golpean la API de Gmail en el mismo
        // instante.
        cron: '2,17,32,47 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(pollDiapersMailbox)
    .commit()
