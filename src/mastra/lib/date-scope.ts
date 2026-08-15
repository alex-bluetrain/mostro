// Los flows scopeados por mes se identifican por año y mes: dos números sueltos, no un tipo
// propio. El string "YYYY-MM" es formato de presentación (sufijo del run id, asunto de mail)
// y se arma solo en el borde donde hace falta.
//
// Acá no hay "mes actual": qué mes quiso decir el usuario es una decisión, y la toma el LLM
// con el hoy que sus instrucciones le inyectan. El código exige el valor, nunca lo inventa.

// Único lugar donde año y mes se vuelven string: el sufijo del run id (`diapers-2026-07`)
// y los asuntos de mail que lo reflejan.
export function formatYearMonth(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`
}

// Mes de una fecha "YYYY-MM-DD". Se usa sobre las fechas que el LLM extrae del cuerpo del mail:
// al año le puede errar cuando el texto no lo dice ("estarán llegando el JUEVES 16-01" ->
// 2025-01-16 para un pedido de 2026-01), pero el mes siempre está escrito. El año lo pone el
// llamador desde su contexto.
export function monthOfIsoDate(isoDate: string): number {
    return Number(isoDate.slice(5, 7))
}
