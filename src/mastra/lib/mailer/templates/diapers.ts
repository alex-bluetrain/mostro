export function diapersRequestEmail({
    size,
    requestedBy,
    yearMonth,
}: {
    size: 'M' | 'G' | 'XG'
    requestedBy: string
    yearMonth: string
}): { subject: string; text: string } {
    // TODO: tomar estos const de variables de entorno
    const patientName = "Juana Quintana";
    const deliveryAddress = "Av. Maipu 1764, Retiro, CABA";
    const requesterName = "Francisca Boloños";
    const requesterPhoneNumber = "555-3039";
    return {
        subject: `Pedido de pañales ${yearMonth}`,
        text: [
            'Buenos Días,',
            '',
            `Les escribo para organizar la entrega de pañales de ${yearMonth} para la paciente ${patientName}`,
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
