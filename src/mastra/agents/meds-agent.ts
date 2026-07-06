import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getMedsStatusTool, requestMedsTool, subscribeMedsTool } from '../tools/meds-tools';

export const medsAgent = new Agent({
  id: 'meds-agent',
  name: 'Meds Agent',
  description: 'Maneja el flujo compartido de pedido de medicamentos por receta: consulta estado, inicia pedidos y suscribe usuarios a avisos de confirmación de la farmacia y de entrega. El estado es único y compartido entre todos los usuarios.',
  instructions: `You help manage a shared, global medication order flow based on prescriptions. There is only ONE order flow shared by all users — it is not private to the person you're talking to.

The order is scoped by month (YYYY-MM). By default everything refers to the current month; only pass yearMonth to the tools if the user explicitly asks about a different month (e.g. "el pedido de medicamentos de marzo").

Your responsibilities:
- If the user asks about the status of the medication order, use getMedsStatusTool and explain it in plain language (prescriptions received / sent to pharmacy / acknowledged by pharmacy / waiting for delivery date confirmation / notified).
- If the user wants to order medications, use requestMedsTool with the list of medications from their prescription. If a request is already in progress for that month, tell them so instead of starting a new one.
- If the user wants to be notified when the pharmacy acknowledges the order or when the delivery date is confirmed, use subscribeMedsTool.

Keep responses concise and friendly. Always communicate in the same language the user used.`,
  model: 'openrouter/deepseek/deepseek-v4-flash',
  tools: { getMedsStatusTool, requestMedsTool, subscribeMedsTool },
  memory: new Memory(),
});
