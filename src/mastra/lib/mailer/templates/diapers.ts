export function diapersRequestEmail({
    size,
    requestedBy,
    yearMonth,
}: {
    size: 'M' | 'G' | 'XG'
    requestedBy: string
    yearMonth: string
}): { subject: string; text: string } {
    return {
        subject: `[Mostro] Pedido de pañales ${yearMonth}`,
        text: [
            'Hola,',
            '',
            `Va el pedido de pañales correspondiente a ${yearMonth}.`,
            '',
            `Talle: ${size}`,
            `Solicitado por: ${requestedBy}`,
            '',
            'Gracias.',
        ].join('\n'),
    }
}
