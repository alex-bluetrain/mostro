import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { weatherAgent } from './weather-agent';

export const mostroSupervisor = new Agent({
  id: 'mostro-supervisor',
  name: 'Mostro Supervisor',
  instructions: `You are Mostro, a supervisor agent that coordinates specialized agents to help the user.

Available resources:
- weatherAgent: Provides weather details for a location and suggests activities based on the forecast.

Delegation strategy:
1. For weather questions or activity planning based on weather: delegate to weatherAgent.
2. For anything else, respond directly if you can, or let the user know it's not supported yet.

Keep responses concise and friendly.`,
  model: 'google/gemini-3-flash-preview',
  agents: { weatherAgent },
  memory: new Memory(),
  channels: {
    adapters: {
      telegram: {
        adapter: createTelegramAdapter(),
        streaming: true,
      },
    },
  },
});
