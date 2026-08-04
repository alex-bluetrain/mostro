import type { Mastra } from '@mastra/core/mastra'
import { z } from 'zod'
import { Ajv } from 'ajv'
import type { ClassificationOutcome, ClassificationRules } from './classification-rules.type'

export type ClassificationResult = {
    label: string
    data?: unknown
    // true cuando ningún outcome matcheó y se aplicó el default-outcome: el step lo usa
    // para marcar el mail con outcome.review en vez de ejecutar un handler.
    isDefault: boolean
}

const ajv = new Ajv({ allErrors: true })

// Funciones puras sobre texto + reglas: sin Gmail, sin side effects. Las reglas vienen
// de Mongo (snapshot activo) y se leen en cada corrida — este módulo no cachea nada.
export async function classifyMail(mastra: Mastra, text: string, rules: ClassificationRules): Promise<ClassificationResult> {
    const defaultLabel = rules['default-outcome'].label
    const label = await classify(mastra, text, rules.outcomes, defaultLabel)
    if (label === defaultLabel) return { label, isDefault: true }

    const outcome = rules.outcomes.find(o => o.label === label)
    if (!outcome) throw new Error(`clasificación devolvió un label desconocido: ${label}`)

    if (!outcome.extract) return { label, isDefault: false }

    const data = await extract(mastra, text, outcome)
    if (!ajv.validate(outcome.extract, data)) {
        throw new Error(`la extracción de "${label}" no valida contra su schema: ${ajv.errorsText(ajv.errors)}`)
    }
    return { label, data, isDefault: false }
}

async function classify(
    mastra: Mastra,
    text: string,
    outcomes: ClassificationOutcome[],
    defaultLabel: string,
): Promise<string> {
    const agent = mastra.getAgent('inboxClassifier')
    const labels = [defaultLabel, ...outcomes.map(o => o.label)] as const
    const schema = z.object({ label: z.enum(labels) })
    const prompt = `Clasificá este mail contra los siguientes resultados posibles. Elegí exactamente uno.

${outcomes.map(formatOutcome).join('\n\n')}

- ${defaultLabel}: usá este resultado si el mail no corresponde a ninguno de los anteriores.

Mail:
${text}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).label
}

function formatOutcome(outcome: ClassificationOutcome): string {
    const lines = [`- ${outcome.label}: ${outcome.condition}`]
    for (const example of outcome.examples?.match ?? []) lines.push(`  Ejemplo que SÍ corresponde: ${example}`)
    for (const example of outcome.examples?.no_match ?? []) lines.push(`  Ejemplo que NO corresponde: ${example}`)
    return lines.join('\n')
}

async function extract(mastra: Mastra, text: string, outcome: ClassificationOutcome): Promise<unknown> {
    const agent = mastra.getAgent('inboxClassifier')
    const prompt = `Extraé del mail los datos que pide el schema. Si no podés completar un campo con confianza, no inventes un valor.

Mail:
${text}`
    const response = await agent.generate(prompt, {
        // JSON Schema puro del snapshot de Mongo: PublicSchema acepta JSONSchema7 directo.
        structuredOutput: { schema: outcome.extract!, errorStrategy: 'strict' },
    })
    return response.object
}
