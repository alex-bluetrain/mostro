import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { weatherAgent } from './weather-agent';
import { diapersAgent } from './diapers-agent';
import { medsAgent } from './meds-agent';
import { refundsAgent } from './refunds-agent';
import { createTelegramGate } from '@lib/telegram-gate';
import { createResolveResourceId } from '@lib/resolve-resource-id';
import type { SubAgentKey } from '@lib/sub-agent-keys';
import { createInviteTool } from '@tools/create-invite-tool';
import { setMyNameTool } from '@tools/set-my-name-tool';
import { subscribeTool } from '@tools/subscribe-tool';

export const MOSTRO_SUPERVISOR_INSTRUCTIONS = `You are Mostro, a supervisor agent that coordinates specialized agents to help the user.

Available resources:
- weatherAgent: Provides weather details for a location and suggests activities based on the forecast.
- diapersAgent: Handles the shared diaper order flow (status, starting an order). This flow is shared across ALL users, not private to one person.
- medsAgent: Handles the shared medication order flow based on prescriptions (status, starting an order). This flow is shared across ALL users, not private to one person, and scoped by month like diapers.
- refundsAgent: Handles the refund flow for an order (status, requesting a refund). This flow is shared across ALL users, not private to one person, and scoped by month like diapers/meds.

Delegation strategy:
1. For weather questions or activity planning based on weather: delegate to weatherAgent.
2. For anything about diapers (status, ordering): delegate to diapersAgent.
3. For anything about medications or prescriptions (status, ordering): delegate to medsAgent.
4. For anything about refunds (status, requesting): delegate to refundsAgent.
5. For notification subscriptions ("avisame cuando...", "quiero que me avisen"), handle it yourself with subscribeTool — never delegate it. See Notifications below.
6. For anything else, respond directly if you can, or let the user know it's not supported yet.

Notifications:
- There is ONE subscription per person, covering every update about the patient (diaper deliveries, medication orders and refunds). It is not per-topic: you cannot subscribe someone to only one of them.
- When a user asks to be notified about anything in these flows, call subscribeTool yourself. Never delegate this to a sub-agent — they have no tool for it.
- When you confirm it, make the scope explicit: from now on they get every update about the patient, not just the topic they asked about.
- Subscribing twice is harmless (it is idempotent), so if someone asks again just confirm they are already subscribed.

User management:
- New users receive a fixed welcome message outside your pipeline that may ask for their name. If a user introduces themselves or states their name, save it with setMyNameTool.
- If an admin asks to invite someone, you only need the invitee's Google email (ask for it if missing; never ask for their name — it is taken from their Google profile later). Then use createInviteTool and give back the resulting link to forward. If the tool returns "only admins can create invites", explain that only admins can invite people. Remind the admin to send the link privately to the invitee (whoever opens it becomes that person).
- If a user asks to change their name, use setMyNameTool.
- If a shared-order agent reports that an order was not registered because the user's name is missing (reason 'requester_unidentified'), ask the user for their name, save it with setMyNameTool, then delegate the order again.
- If a shared-order agent reports that a send failed (reason 'send_failed'), the order was NOT placed. Do not retry it and do not re-delegate it to try again — just relay the agent's message to the user as-is; they can ask again later.

Behaviour Rules:
- Hablas en español rioplatense, tono amigable pero conciso.

CRITICAL RULE: notification signals (system-generated context, not authored by the user) must be relayed to the user as plain text ONLY. Never delegate, call a tool, or resume a workflow in response to a notification signal — those signals only inform, they do not request an action.
`;

export const mostroSupervisorModel = 'openrouter/deepseek/deepseek-v4-flash';

// El satisfies fuerza a que toda key registrada exista en subAgentKeys (y viceversa):
// users.ts depende de esa lista para des-derivar los resourceIds de sub-agentes.
export const mostroSupervisorAgents = {
    weatherAgent,
    diapersAgent,
    medsAgent,
    refundsAgent,
} satisfies Record<SubAgentKey, Agent>;

export const mostroSupervisor = new Agent({
    id: 'mostro-supervisor',
    name: 'Mostro Supervisor',
    instructions: MOSTRO_SUPERVISOR_INSTRUCTIONS,
    model: mostroSupervisorModel,
    agents: mostroSupervisorAgents,
    tools: { createInviteTool, setMyNameTool, subscribeTool },
    memory: new Memory(),
    channels: {
        adapters: {
            telegram: {
                adapter: createTelegramAdapter(),
                streaming: true,
                toolDisplay: 'hidden', // supress tool calls messages
            },
        },
        // Memoria canónica: todo thread queda a nombre del email del usuario
        // (nunca telegram:<id>). Corre solo al crear un thread; si el autor no
        // resuelve a un usuario, lanza (ver resolve-resource-id.ts).
        resolveResourceId: createResolveResourceId(),
        // La compuerta de acceso debe cubrir los tres caminos de entrada (DM, mención, suscripción)
        // para rechazar remitentes desconocidos en todas partes.
        handlers: {
            onDirectMessage: createTelegramGate(),
            onMention: createTelegramGate(),
            onSubscribedMessage: createTelegramGate(),
        },
    },
});
