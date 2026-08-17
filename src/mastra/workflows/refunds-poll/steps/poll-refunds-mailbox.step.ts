import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { classifierRepository } from '@business/repositories'
import { InboxManager, OUTCOME_COMPLETED, OUTCOME_FAILED, OUTCOME_REVIEW } from '@lib/inbox-manager/inbox-manager'
import { classifyMail } from '@lib/mail-classifier/mail-classifier'
import { processOutcome } from '@lib/outcome-processor/outcome-processor'
import { refundsInboxConfig } from '../refunds-inbox.config'
import { refundsOutcomeHandlers } from '../refunds-outcome-handlers'

// El `mastra` real recién existe cuando termina de construirse el Mastra instance, así que
// init() (que traduce la query) se difiere a la primera ejecución. init() es idempotente:
// los ciclos de cron siguientes reusan la query ya traducida.
const manager = new InboxManager(refundsInboxConfig)

export const pollRefundsMailbox = createStep({
    id: 'poll-refunds-mailbox',
    inputSchema: z.object({ dryRun: z.boolean().default(false) }),
    outputSchema: z.object({ ok: z.literal(true) }),
    execute: async ({ mastra, inputData: { dryRun } }) => {
        if (!mastra) throw new Error('[poll-refunds-mailbox] no hay instancia de mastra disponible')
        const logger = mastra.getLogger()

        if (!manager.initialized) await manager.init(mastra)

        // Reglas frescas de Mongo en cada corrida: publicar un snapshot nuevo impacta en
        // el siguiente ciclo de cron sin redeploy.
        const rules = await classifierRepository.findActiveRules('refunds')
        if (!rules) {
            // Sin reglas no hay nada que decidir: saltear es preferible a tocar la casilla
            // y dejar los mails a medio procesar. El aviso ya salio en el boot.
            logger.warn('[poll-refunds-mailbox] "refunds" todavia no tiene reglas activas, salteo la corrida')
            return { ok: true as const }
        }

        const mails = await manager.fetch()

        for (const mail of mails) {
            try {
                const { label, data, isDefault } = await classifyMail(mastra, mail.text, rules)

                if (dryRun) {
                    // Clasificar es sólo lectura, así que se hace igual; lo que se saltea es
                    // todo lo que deja rastro (labels en Gmail y resume del workflow).
                    logger.info(`[poll-refunds-mailbox] (dry-run) ${mail.id} -> "${label}"${isDefault ? ' (default: iría a review)' : ''}`, { year: mail.year, month: mail.month, data })
                    continue
                }

                await manager.applyLabel(mail.id, label)

                if (isDefault) {
                    // Ningún outcome matcheó: queda marcado para intervención manual.
                    await manager.applyLabel(mail.id, OUTCOME_REVIEW)
                    continue
                }

                const result = await processOutcome(refundsOutcomeHandlers, label, { mastra, text: mail.text, year: mail.year, month: mail.month, data })
                if (!result.ok) logger.error(`[poll-refunds-mailbox] ${mail.id} clasificado como "${label}" pero el handler falló: ${result.reason}`)
                await manager.applyLabel(mail.id, result.ok ? OUTCOME_COMPLETED : OUTCOME_FAILED)
            } catch (error) {
                // Un mail roto no corta el loop: se marca fallido (best-effort) y se sigue.
                logger.error(`[poll-refunds-mailbox] no pude procesar ${mail.id}`, { error })
                if (dryRun) continue
                await manager.applyLabel(mail.id, OUTCOME_FAILED).catch(labelError =>
                    logger.error(`[poll-refunds-mailbox] no pude etiquetar ${mail.id} como "${OUTCOME_FAILED}"`, { labelError }))
            }
        }

        return { ok: true as const }
    },
})
