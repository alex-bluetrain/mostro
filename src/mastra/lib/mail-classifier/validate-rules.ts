import type { ClassificationRules } from './classification-rules.type'

// Validación de shape mínimo: el detalle semántico (conditions, schemas) es
// responsabilidad de quien escribe el JSON; acá solo se evita publicar basura
// estructural. Lanza Error para que cada caller decida qué hacer (el script
// aborta, el bootstrap del boot loguea y sigue).
export function validateRules(raw: unknown): ClassificationRules {
    const invalid = (message: string): never => {
        throw new Error(message)
    }

    if (typeof raw !== 'object' || raw === null) invalid('el JSON no es un objeto')
    const rules = raw as Record<string, unknown>

    const outcomes = rules.outcomes
    if (!Array.isArray(outcomes) || outcomes.length === 0) invalid('"outcomes" tiene que ser un array no vacío')
    for (const [i, outcome] of (outcomes as Record<string, unknown>[]).entries()) {
        if (typeof outcome?.label !== 'string' || !outcome.label) invalid(`outcomes[${i}].label tiene que ser un string no vacío`)
        if (typeof outcome?.condition !== 'string' || !outcome.condition) invalid(`outcomes[${i}].condition tiene que ser un string no vacío`)
    }

    const defaultOutcome = rules['default-outcome'] as Record<string, unknown> | undefined
    if (typeof defaultOutcome?.label !== 'string' || !defaultOutcome.label) invalid('"default-outcome".label tiene que ser un string no vacío')

    return raw as ClassificationRules
}
