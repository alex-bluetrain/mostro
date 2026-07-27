import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { pollOutputSchema } from '../../lib/inbox/poll-step'
import { pollMedsMailbox } from './steps/poll-meds-mailbox.step'

export const medsPollWorkflow = createWorkflow({
    id: 'meds-poll',
    inputSchema: z.object({}),
    outputSchema: pollOutputSchema,
    schedule: {
        // Desfasado de diapers (2,17,32,47) y refunds (12,27,42,57): sigue siendo cada 15
        // minutos, pero así los tres dominios no golpean la API de Gmail en el mismo
        // instante.
        cron: '7,22,37,52 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(pollMedsMailbox)
    .commit()
