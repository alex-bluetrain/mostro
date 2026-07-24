export function medsRequestEmail({
    medications,
    requestedBy,
    yearMonth,
}: {
    medications: string[]
    requestedBy: string
    yearMonth: string
}): { subject: string; text: string } {
    return {
        subject: `[Mostro] Pedido de medicamentos ${yearMonth}`,
        text: [
            'Hola,',
            '',
            `Va el pedido de medicamentos correspondiente a ${yearMonth}.`,
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
