import { createSkill } from '@mastra/core/skills'

// Instrucciones que antes vivían en el refunds agent (hoy colapsado en el
// loop único del supervisor). Las tools viven en el catálogo.
export const refundsSkill = createSkill({
    name: 'refunds',
    description:
        'Cómo manejar el flujo compartido de reintegros/reembolsos de una orden: consultar estado e iniciar el pedido de reembolso, con scoping mensual. Usa las tools get-refunds-status y request-refund.',
    instructions: `# Reintegros / reembolsos

Hay UN solo flujo de reembolso compartido por todos los usuarios — no es privado de quien te habla.

El reembolso tiene alcance mensual. Pasá siempre month (1-12) y year a las tools — son obligatorios, las tools no los adivinan. Usá el mes actual salvo que el usuario nombre otro (ej: "el reembolso de marzo" → month: 3). Si es ambiguo qué mes quiere, preguntá antes de llamar la tool.

Responsabilidades:
- Estado del reembolso: usá la tool \`get-refunds-status\` y explicalo en lenguaje llano (solicitado / acusado por el procesador de pagos / confirmado / depósito recibido / notificado).
- Pedir un reembolso: usá la tool \`request-refund\` con el monto (amount) y un motivo opcional (reason). Si ya hay un reembolso en curso ese mes, avisale en vez de iniciar otro.
- Si la tool devuelve { ok: false, reason: 'requester_unidentified' }: no reintentes — pedile el nombre al usuario, guardalo con setMyNameTool y recién ahí volvé a pedir.
- Si la tool devuelve { ok: false, reason: 'send_failed' }: el reembolso NO se solicitó. No reintentes automáticamente — transmití el mensaje tal cual; puede volver a pedirlo más tarde.`,
})
