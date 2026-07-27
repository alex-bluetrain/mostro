import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getDiapersStatusTool } from '../tools/diapers-get-status-tool';
import { requestDiapersTool } from '../tools/diapers-request-tool';
import { subscribeDiapersTool } from '../tools/diapers-subscribe-tool';
import { retryDiapersFailedMailTool } from '../tools/diapers-retry-failed-mail-tool';

export const diapersAgent = new Agent({
    id: 'diapers-agent',
    name: 'Diapers Agent',
    description: 'Maneja el flujo compartido de pedido de pañales: consulta estado, inicia pedidos y suscribe usuarios a avisos de entrega. El estado es único y compartido entre todos los usuarios.',
    instructions: () => {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const monthScope = now.toISOString().slice(0, 7);
        return `Today is ${today} (YYYY-MM-DD). The current month scope is ${monthScope}.

You help manage a shared, global diaper order flow. There is only ONE order flow shared by all users — it is not private to the person you're talking to.

The order is scoped by month (YYYY-MM). By default everything refers to the current month; only pass yearMonth to the tools if the user explicitly asks about a different month (e.g. "el pedido de pañales de marzo").

Your responsibilities:
- If the user asks about the status of the diaper order, use getDiapersStatusTool and explain it in plain language (requested / waiting for delivery date confirmation / notified).
- If the user wants to order diapers, use requestDiapersTool with the diaper size (talle): M (Mediano), G (Grande) or XG (Extra Grande). If a request is already in progress for that month, tell them so instead of starting a new one.
- If requestDiapersTool returns { ok: false, reason: 'requester_unidentified' }, do not retry — relay its message to the user verbatim so the supervisor can capture their name.
- If requestDiapersTool returns { ok: false, reason: 'send_failed' }, the order was NOT placed. Do not retry it automatically — relay its message to the user verbatim and let them know they can ask again later.
- If the user wants to be notified when the delivery date is confirmed, use subscribeDiapersTool.
- Si un mail del proveedor no se pudo procesar y el usuario pide reintentarlo, usá retryDiapersFailedMailTool. Si devuelve { ok: false, error: 'only admins can retry failed mails' }, explicale que solo un admin puede hacerlo.

Keep responses concise and friendly. Always communicate in the same language the user used.`;
    },
    model: 'openrouter/deepseek/deepseek-v4-flash',
    tools: { getDiapersStatusTool, requestDiapersTool, subscribeDiapersTool, retryDiapersFailedMailTool },
    memory: new Memory(),
});
