import type { gmail_v1 } from '@googleapis/gmail'

// Gmail agrega un header X-Received en cada hop con la fecha en que ese hop recibió el mail.
// El primero que agrega el server de origen -el más viejo de todos- es la fecha real de envío
// del remitente: no depende de cuándo Gmail terminó de entregarlo a esta casilla ni de
// reintentos en la cola de entrega. Por eso determina el año-mes del mail de forma
// determinista, sin necesidad de probar más de un mes al reanudar un run.
export function resolveMailDate(
    headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
    fallback: Date,
): Date {
    const dates = (headers ?? [])
        .filter(h => h.name?.toLowerCase() === 'x-received')
        .map(h => parseReceivedDate(h.value))
        .filter((d): d is Date => d !== null)

    if (dates.length === 0) return fallback

    return dates.reduce((min, d) => (d < min ? d : min))
}

// El valor tiene forma "by ...; Wed, 30 Jul 2026 08:12:33 -0700 (PDT)": la fecha va después
// del último ";".
function parseReceivedDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const dateString = value.slice(value.lastIndexOf(';') + 1).trim()
    const date = new Date(dateString)
    return Number.isNaN(date.getTime()) ? null : date
}
