import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { classifierRepository } from '@business/repositories'
import { InboxManager, OUTCOME_COMPLETED, OUTCOME_FAILED, OUTCOME_REVIEW } from '@lib/inbox-manager/inbox-manager'
import { classifyMail } from '@lib/mail-classifier/mail-classifier'
import { processOutcome } from '@lib/outcome-processor/outcome-processor'
import { diapersInboxConfig } from '../diapers-inbox.config'
import { diapersOutcomeHandlers } from '../diapers-outcome-handlers'

// El `mastra` real recién existe cuando termina de construirse el Mastra instance, así que
// init() (que traduce la query) se difiere a la primera ejecución. init() es idempotente:
// los ciclos de cron siguientes reusan la query ya traducida.
const manager = new InboxManager(diapersInboxConfig)

export const pollDiapersMailbox = createStep({
    id: 'poll-diapers-mailbox',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.literal(true) }),
    execute: async ({ mastra }) => {
        if (!mastra) throw new Error('[poll-diapers-mailbox] no hay instancia de mastra disponible')

        if (!manager.initialized) await manager.init(mastra)

        // Reglas frescas de Mongo en cada corrida: publicar un snapshot nuevo impacta en
        // el siguiente ciclo de cron sin redeploy.
        const rules = await classifierRepository.getActiveRules('diapers')
        const mails = await manager.fetch()

        for (const mail of mails) {
            try {
                const { label, data, isDefault } = await classifyMail(mastra, mail.text, rules)
                await manager.applyLabel(mail.id, label)

                if (isDefault) {
                    // Ningún outcome matcheó: queda marcado para intervención manual.
                    await manager.applyLabel(mail.id, OUTCOME_REVIEW)
                    continue
                }

                const result = await processOutcome(diapersOutcomeHandlers, label, { mastra, text: mail.text, year: mail.year, month: mail.month, data })
                if (!result.ok) console.error(`[poll-diapers-mailbox] ${mail.id} clasificado como "${label}" pero el handler falló: ${result.reason}`)
                await manager.applyLabel(mail.id, result.ok ? OUTCOME_COMPLETED : OUTCOME_FAILED)
            } catch (error) {
                // Un mail roto no corta el loop: se marca fallido (best-effort) y se sigue.
                console.error(`[poll-diapers-mailbox] no pude procesar ${mail.id}`, error)
                await manager.applyLabel(mail.id, OUTCOME_FAILED).catch(labelError =>
                    console.error(`[poll-diapers-mailbox] no pude etiquetar ${mail.id} como "${OUTCOME_FAILED}"`, labelError))
            }
        }

        return { ok: true as const }
    },
})
