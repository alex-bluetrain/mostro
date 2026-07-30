import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { InboxClassifier, type InboxClassifierConfig } from './inbox-classifier'

export const classifierOutputSchema = z.object({ ok: z.literal(true) })

// La instancia vive acá, no en el módulo de config del dominio: en el momento en que ese
// módulo se evalúa (durante el import chain que arranca en index.ts) el `mastra` real
// todavía no existe — recién queda asignado cuando termina de construirse el Mastra
// instance. El step sí lo recibe en cada ejecución, así que la instancia se crea (y se
// traduce la query) una sola vez, la primera vez que corre, y se reusa en los ciclos
// de cron siguientes.
export function createClassifierStep(id: string, config: InboxClassifierConfig) {
    let classifier: InboxClassifier | undefined

    return createStep({
        id,
        inputSchema: z.object({}),
        outputSchema: classifierOutputSchema,
        execute: async ({ mastra }) => {
            if (!mastra) throw new Error(`[${id}] no hay instancia de mastra disponible`)

            if (!classifier) {
                const instance = new InboxClassifier(mastra, config)
                await instance.init()
                classifier = instance
            }

            try {
                await classifier.run()
            } catch (error) {
                console.error(`[${id}] fallo el ciclo de polling`, error)
                throw error
            }

            return { ok: true as const }
        },
    })
}
