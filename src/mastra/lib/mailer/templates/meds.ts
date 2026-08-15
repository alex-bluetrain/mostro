import { formatYearMonth } from '@lib/date-scope'

export function medsRequestEmail({
    medications,
    requestedBy,
    year,
    month,
}: {
    medications: string[]
    requestedBy: string
    year: number
    month: number
}): { subject: string; text: string } {
    const period = formatYearMonth(year, month)
    return {
        subject: `[Mostro] Pedido de medicamentos ${period}`,
        text: [
            'Hola,',
            '',
            `Va el pedido de medicamentos correspondiente a ${period}.`,
            '',
            'Medicamentos:',
            ...medications.map(medication => `- ${medication}`),
            '',
            `Solicitado por: ${requestedBy}`,
            '',
            'Gracias.',
        ].join('\n'),
    }
}
