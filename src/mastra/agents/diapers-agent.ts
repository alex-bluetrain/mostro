import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getDiapersStatusTool, requestDiapersTool, subscribeDiapersTool } from '../tools/diapers-tools';

export const diapersAgent = new Agent({
  id: 'diapers-agent',
  name: 'Diapers Agent',
  description: 'Maneja el flujo compartido de pedido de pañales: consulta estado, inicia pedidos y suscribe usuarios a avisos de entrega. El estado es único y compartido entre todos los usuarios.',
  instructions: `You help manage a shared, global diaper order flow. There is only ONE order flow shared by all users — it is not private to the person you're talking to.

The order is scoped by month (YYYY-MM). By default everything refers to the current month; only pass yearMonth to the tools if the user explicitly asks about a different month (e.g. "el pedido de pañales de marzo").

Your responsibilities:
- If the user asks about the status of the diaper order, use getDiapersStatusTool and explain it in plain language (requested / waiting for delivery date confirmation / notified).
- If the user wants to order diapers, use requestDiapersTool with the diaper type and quantity. If a request is already in progress for that month, tell them so instead of starting a new one.
- If the user wants to be notified when the delivery date is confirmed, use subscribeDiapersTool.

Keep responses concise and friendly. Always communicate in the same language the user used.`,
  model: 'openrouter/deepseek/deepseek-v4-flash',
  tools: { getDiapersStatusTool, requestDiapersTool, subscribeDiapersTool },
  memory: new Memory(),
});
