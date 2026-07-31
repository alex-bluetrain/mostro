import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { InboxClassifier } from '@lib/inbox-classifier/inbox-classifier'
import { diapersInboxClassifierConfig } from '../diapers-inbox-classifier.config'

// El `mastra` real recién existe cuando termina de construirse el Mastra instance, así que
// init() (que traduce la query) se difiere a la primera ejecución. init() es idempotente:
// los ciclos de cron siguientes reusan la query ya traducida.
const classifier = new InboxClassifier(diapersInboxClassifierConfig)

export const pollDiapersMailbox = createStep({
    id: 'poll-diapers-mailbox',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.literal(true) }),
    execute: async ({ mastra }) => {
        if (!mastra) throw new Error('[poll-diapers-mailbox] no hay instancia de mastra disponible')

        if (!classifier.initialized) await classifier.init(mastra)

        try {
            await classifier.run()
        } catch (error) {
            console.error('[poll-diapers-mailbox] fallo el ciclo de polling', error)
            throw error
        }

        return { ok: true as const }
    },
})
