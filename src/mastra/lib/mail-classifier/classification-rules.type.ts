// Formato del JSON de reglas que vive en Mongo (ver docs/clasificador.md). El `extract`
// es JSON Schema puro: es la fuente de verdad, se pasa directo al LLM como structured
// output y se valida con ajv. No hay Zod acá a propósito.
export type ExtractSchema = Record<string, unknown>

export type ClassificationOutcome = {
    label: string
    // Descripción en lenguaje natural para que el LLM decida si el mail matchea.
    condition: string
    // Few-shot para guiar al LLM: fragmentos de mails que matchean y que no.
    examples?: { match?: string[]; no_match?: string[] }
    // Presente solo si hay datos que extraer del mail en caso de match.
    extract?: ExtractSchema
}

export type ClassificationRules = {
    outcomes: ClassificationOutcome[]
    // Se aplica cuando ningún outcome matchea. No es terminal: marca el mail para
    // intervención manual (el step le agrega outcome.review).
    'default-outcome': { label: string }
}
