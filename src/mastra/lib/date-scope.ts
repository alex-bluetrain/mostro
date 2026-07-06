// YYYY-MM en horario local, usado como default cuando un flow scopeado por mes no especifica uno.
export function getCurrentYearMonth(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}
