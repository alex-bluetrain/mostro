import { formatUnixDate } from '../../unix-time'

export function refundRequestEmail({
    amount,
    reason,
    requestedBy,
    yearMonth,
}: {
    amount: number
    reason?: string
    requestedBy: string
    yearMonth: string
}): { subject: string; text: string } {
    const lines = [
        'Hola,',
        '',
        `Va una solicitud de reintegro correspondiente a ${yearMonth}.`,
        '',
        `Monto: ${amount}`,
    ]

    // Los campos opcionales se omiten: una línea "Motivo: undefined" es peor que no tenerla.
    if (reason) lines.push(`Motivo: ${reason}`)

    lines.push(`Solicitado por: ${requestedBy}`, '', 'Gracias.')

    return {
        subject: `[Mostro] Solicitud de reintegro ${yearMonth}`,
        text: lines.join('\n'),
    }
}

export function depositConfirmedEmail({
    depositAmount,
    depositDate,
    refundReference,
    yearMonth,
}: {
    depositAmount?: number
    depositDate?: number
    refundReference?: string
    yearMonth: string
}): { subject: string; text: string } {
    const lines = [
        'Hola,',
        '',
        `Confirmamos la recepción del depósito del reintegro ${yearMonth}.`,
        '',
    ]

    if (depositAmount !== undefined) lines.push(`Monto depositado: ${depositAmount}`)
    if (depositDate !== undefined) lines.push(`Fecha del depósito: ${formatUnixDate(depositDate)}`)
    if (refundReference) lines.push(`Referencia: ${refundReference}`)

    lines.push('', 'Gracias.')

    return {
        subject: `[Mostro] Depósito confirmado ${yearMonth}`,
        text: lines.join('\n'),
    }
}
