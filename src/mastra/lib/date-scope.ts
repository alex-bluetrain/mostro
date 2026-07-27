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

// El mail de respuesta no siempre cae en el mismo mes que el pedido: uno abierto el 30 de
// julio se puede confirmar el 2 de agosto. El poller usa estas dos para probar el mes del
// mail y, si ahí no hay run suspendido, el anterior.
export function yearMonthOf(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}

export function previousYearMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number)
    return month === 1
        ? `${year - 1}-12`
        : `${year}-${String(month - 1).padStart(2, '0')}`
}
