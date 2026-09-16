import { createSkill } from '@mastra/core/skills'

// Instrucciones que antes vivían en el meds agent (hoy colapsado en el
// loop único del supervisor). Las tools viven en el catálogo.
export const medsSkill = createSkill({
    name: 'meds',
    description:
        'Cómo manejar el pedido compartido de medicamentos por receta: consultar estado e iniciar pedidos a la farmacia, con scoping mensual. Usa las tools get-meds-status y request-meds.',
    instructions: `# Pedido de medicamentos

Hay UN solo flujo de pedido de medicamentos (por receta) compartido por todos los usuarios — no es privado de quien te habla.

El pedido tiene alcance mensual. Pasá siempre month (1-12) y year a las tools — son obligatorios, las tools no los adivinan. Usá el mes actual salvo que el usuario nombre otro (ej: "el pedido de medicamentos de marzo" → month: 3). Si es ambiguo qué mes quiere, preguntá antes de llamar la tool.

Responsabilidades:
- Estado del pedido: usá la tool \`get-meds-status\` y explicalo en lenguaje llano (enviado a la farmacia / farmacia lo confirmó / esperando confirmación de fecha de entrega / notificado).
- Pedir medicamentos: usá la tool \`request-meds\` con la lista de medicamentos de la receta. Si ya hay un pedido en curso ese mes, avisale en vez de iniciar otro.
- Si la tool devuelve { ok: false, reason: 'requester_unidentified' }: no reintentes — pedile el nombre al usuario, guardalo con setMyNameTool y recién ahí volvé a pedir.
- Si la tool devuelve { ok: false, reason: 'send_failed' }: el pedido NO salió. No reintentes automáticamente — transmití el mensaje tal cual; puede volver a pedirlo más tarde.`,
})
