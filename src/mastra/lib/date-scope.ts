// YYYY-MM en horario local, usado como default cuando un flow scopeado por mes no especifica uno.
export function getCurrentYearMonth(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}

// Los runs son deterministas por dominio y mes: `diapers-2026-07`, `meds-2026-07`.
// El mes es todo lo que sigue al primer guion; si no hay prefijo, ya es un YYYY-MM.
export function yearMonthFromRunId(runId: string): string {
    const match = runId.match(/^[a-z]+-(\d{4}-\d{2})$/)
    return match ? match[1] : runId
}
