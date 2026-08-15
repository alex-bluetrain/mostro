import { formatYearMonth } from '@lib/date-scope'
import { formatUnixDate } from '@lib/unix-time'

export function refundRequestEmail({
    amount,
    reason,
    requestedBy,
    year,
    month,
}: {
    amount: number
    reason?: string
    requestedBy: string
    year: number
    month: number
}): { subject: string; text: string } {
    const period = formatYearMonth(year, month)
    const lines = [
        'Hola,',
        '',
        `Va una solicitud de reintegro correspondiente a ${period}.`,
        '',
        `Monto: ${amount}`,
    ]

    // Los campos opcionales se omiten: una línea "Motivo: undefined" es peor que no tenerla.
    if (reason) lines.push(`Motivo: ${reason}`)

    lines.push(`Solicitado por: ${requestedBy}`, '', 'Gracias.')

    return {
        subject: `[Mostro] Solicitud de reintegro ${period}`,
        text: lines.join('\n'),
    }
}

export function depositConfirmedEmail({
    depositAmount,
    depositDate,
    refundReference,
    year,
    month,
}: {
    depositAmount?: number
    depositDate?: number
    refundReference?: string
    year: number
    month: number
}): { subject: string; text: string } {
    const period = formatYearMonth(year, month)
    const lines = [
        'Hola,',
        '',
        `Confirmamos la recepción del depósito del reintegro ${period}.`,
        '',
    ]

    if (depositAmount !== undefined) lines.push(`Monto depositado: ${depositAmount}`)
    if (depositDate !== undefined) lines.push(`Fecha del depósito: ${formatUnixDate(depositDate)}`)
    if (refundReference) lines.push(`Referencia: ${refundReference}`)

    lines.push('', 'Gracias.')

    return {
        subject: `[Mostro] Depósito confirmado ${period}`,
        text: lines.join('\n'),
    }
}
