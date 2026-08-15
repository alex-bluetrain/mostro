import { formatYearMonth } from '@lib/date-scope'

export function diapersRequestEmail({
    size,
    requestedBy,
    year,
    month,
}: {
    size: 'M' | 'G' | 'XG'
    requestedBy: string
    year: number
    month: number
}): { subject: string; text: string } {
    const period = formatYearMonth(year, month)
    // TODO: tomar estos const de variables de entorno
    const patientName = "Juana Quintana";
    const deliveryAddress = "Calle Falsa 123, Springfield";
    const requesterName = "Francisca Boloños";
    const requesterPhoneNumber = "555-3039";
    return {
        subject: `Pedido de pañales ${period}`,
        text: [
            'Buenos Días,',
            '',
            `Les escribo para organizar la entrega de pañales de ${period} para la paciente ${patientName}`,
            '',
            `Talle: ${size}`,
            `Dirección: ${deliveryAddress}`,
            '',
            'Aguardo respuesta',
            'Gracias.',
            '',
            `${requesterName}`,
            `${requesterPhoneNumber}`,
        ].join('\n'),
    }
}
