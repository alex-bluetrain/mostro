import { createSkill } from '@mastra/core/skills'

// Instrucciones que antes vivían en el diapers agent (hoy colapsado en el
// loop único del supervisor). Las tools viven en el catálogo.
export const diapersSkill = createSkill({
    name: 'diapers',
    description:
        'Cómo manejar el pedido compartido de pañales: consultar estado e iniciar pedidos por talle (M/G/XG), con scoping mensual. Usa las tools get-diapers-status y request-diapers.',
    instructions: `# Pedido de pañales

Hay UN solo flujo de pedido de pañales compartido por todos los usuarios — no es privado de quien te habla.

El pedido tiene alcance mensual. Pasá siempre month (1-12) y year a las tools — son obligatorios, las tools no los adivinan. Usá el mes actual salvo que el usuario nombre otro (ej: "el pedido de pañales de marzo" → month: 3). Si es ambiguo qué mes quiere, preguntá antes de llamar la tool.

Responsabilidades:
- Estado del pedido: usá la tool \`get-diapers-status\` y explicalo en lenguaje llano (pedido / esperando confirmación de fecha de entrega / notificado).
- Pedir pañales: usá la tool \`request-diapers\` con el talle: M (Mediano), G (Grande) o XG (Extra Grande). Si ya hay un pedido en curso ese mes, avisale en vez de iniciar otro.
- Si la tool devuelve { ok: false, reason: 'requester_unidentified' }: no reintentes — pedile el nombre al usuario, guardalo con setMyNameTool y recién ahí volvé a pedir.
- Si la tool devuelve { ok: false, reason: 'send_failed' }: el pedido NO salió. No reintentes automáticamente — transmití el mensaje tal cual; puede volver a pedirlo más tarde.`,
})
