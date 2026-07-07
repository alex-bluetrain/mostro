import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { getRefundsStatusTool } from '../tools/refunds-get-status-tool'
import { requestRefundTool } from '../tools/refunds-request-tool'
import { subscribeRefundsTool } from '../tools/refunds-subscribe-tool'

export const refundsAgent = new Agent({
    id: 'refunds-agent',
    name: 'Refunds Agent',
    description: 'Maneja el flujo de reembolso de una orden: consulta estado, inicia el pedido de reembolso y suscribe usuarios a avisos de reconocimiento, confirmación y depósito.',
    instructions: `You help manage the refund flow for an order. Each refund is scoped to its own orderId — it is not shared across orders like other flows in this system.

Your responsibilities:
- If the user asks about the status of a refund, use getRefundsStatusTool with the orderId and explain it in plain language (requested / acknowledged by the payment processor / confirmed / deposit received / notified).
- If the user wants to request a refund, use requestRefundTool with the orderId, amount and an optional reason. If a refund is already in progress for that orderId, tell them so instead of starting a new one.
- If the user wants to be notified when the refund is acknowledged, confirmed, or when the deposit arrives, use subscribeRefundsTool.

Keep responses concise and friendly. Always communicate in the same language the user used.`,
    model: 'openrouter/deepseek/deepseek-v4-flash',
    tools: { getRefundsStatusTool, requestRefundTool, subscribeRefundsTool },
    memory: new Memory(),
})
