import { createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

import { pollRefundsMailbox } from './steps/poll-refunds-mailbox.step'

export const refundsPollWorkflow = createWorkflow({
    id: 'refunds-poll',
    // dryRun sólo se usa cuando se dispara a mano desde el playground: clasifica y loguea,
    // pero no etiqueta en Gmail ni resume workflows. El cron siempre corre en falso.
    inputSchema: z.object({ dryRun: z.boolean().default(false) }),
    outputSchema: z.object({ ok: z.literal(true) }),
    schedule: {
        // Desfasado de diapers (2,17,32,47) y meds (7,22,37,52): sigue siendo cada 15
        // minutos, pero así los tres dominios no golpean la API de Gmail en el mismo
        // instante.
        cron: '12,27,42,57 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: { dryRun: false },
    },
})
    .then(pollRefundsMailbox)
    .commit()
