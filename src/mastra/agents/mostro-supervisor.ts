import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { weatherAgent } from './weather-agent';
import { diapersAgent } from './diapers-agent';
import { medsAgent } from './meds-agent';
import { refundsAgent } from './refunds-agent';
import { createTelegramGate } from '../lib/telegram-gate';
import { createInviteTool } from '../tools/create-invite-tool';
import { setMyNameTool } from '../tools/set-my-name-tool';
import { getUserByTelegramId } from '../lib/users';

export const MOSTRO_SUPERVISOR_INSTRUCTIONS = `You are Mostro, a supervisor agent that coordinates specialized agents to help the user.

Available resources:
- weatherAgent: Provides weather details for a location and suggests activities based on the forecast.
- diapersAgent: Handles the shared diaper order flow (status, starting an order, subscribing to delivery-date notifications). This flow is shared across ALL users, not private to one person.
- medsAgent: Handles the shared medication order flow based on prescriptions (status, starting an order, subscribing to pharmacy-acknowledgement and delivery-date notifications). This flow is shared across ALL users, not private to one person, and scoped by month like diapers.
- refundsAgent: Handles the refund flow for an order (status, requesting a refund, subscribing to acknowledgement, confirmation and deposit notifications). This flow is shared across ALL users, not private to one person, and scoped by month like diapers/meds.

Delegation strategy:
1. For weather questions or activity planning based on weather: delegate to weatherAgent.
2. For anything about diapers (status, ordering, notifications): delegate to diapersAgent.
3. For anything about medications or prescriptions (status, ordering, notifications): delegate to medsAgent.
4. For anything about refunds (status, requesting, notifications): delegate to refundsAgent.
5. For anything else, respond directly if you can, or let the user know it's not supported yet.

User management:
- If a user message is exactly "/start <code>", they just joined through an invite link: welcome them warmly, briefly explain what you can do, and ask their name. When they answer, save it with setMyNameTool.
- If an admin asks to invite someone, you need the invitee's Google email (ask for it if missing; also ask for their name, which is optional). Then use createInviteTool and give back the resulting link to forward. If the tool returns "only admins can create invites", explain that only admins can invite people. Remind the admin to send the link privately to the invitee (whoever opens it becomes that person).
- If a user asks to change their name, use setMyNameTool.

Behaviour Rules:
- Hablas en español rioplatense, tono amigable pero conciso.

CRITICAL RULE: notification signals (system-generated context, not authored by the user) must be relayed to the user as plain text ONLY. Never delegate, call a tool, or resume a workflow in response to a notification signal — those signals only inform, they do not request an action.
`;

export const mostroSupervisorModel = 'openrouter/deepseek/deepseek-v4-flash';

export const mostroSupervisorAgents = { weatherAgent, diapersAgent, medsAgent, refundsAgent };

export const mostroSupervisor = new Agent({
    id: 'mostro-supervisor',
    name: 'Mostro Supervisor',
    instructions: MOSTRO_SUPERVISOR_INSTRUCTIONS,
    model: mostroSupervisorModel,
    agents: mostroSupervisorAgents,
    tools: { createInviteTool, setMyNameTool },
    memory: new Memory(),
    channels: {
        adapters: {
            telegram: {
                adapter: createTelegramAdapter(),
                streaming: true,
                toolDisplay: 'hidden', // supress tool calls messages
            },
        },
        // Memoria canónica: los threads nuevos de DM quedan a nombre del email
        // del usuario (no de telegram:<id>), así la futura web comparte memoria.
        // Corre solo al crear un thread; si no resuelve, cae al default (fail-safe).
        resolveResourceId: async ({ thread, message, defaultResourceId }) => {
            if (!thread.isDM) return defaultResourceId;
            const user = await getUserByTelegramId(message.author.userId);
            return user?.email ?? defaultResourceId;
        },
        // La compuerta de acceso debe cubrir los tres caminos de entrada (DM, mención, suscripción)
        // para rechazar remitentes desconocidos en todas partes.
        handlers: {
            onDirectMessage: createTelegramGate(),
            onMention: createTelegramGate(),
            onSubscribedMessage: createTelegramGate(),
        },
    },
});
