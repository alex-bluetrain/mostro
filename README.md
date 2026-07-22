# Mostro

<p align="center">
  <img src="docs/roblov.gif" alt="Mostro"/>
</p>

A multi-agent Telegram bot for managing recurring family orders — diapers, medications, and refunds — built with [Mastra](https://mastra.ai/).

Mostro uses a **supervisor/delegation architecture**: a central supervisor agent receives Telegram messages and routes them to specialized domain agents. Each domain agent orchestrates a workflow with **suspend/resume semantics** — workflows pause at specific steps waiting for external webhook callbacks, then notify subscribed users when milestones are reached.

## Features

- **Supervisor pattern** — single entry point that delegates to domain-specific agents based on intent
- **Suspend/resume workflows** — long-running order flows that halt until external systems call back via webhooks
- **Notification subscriptions** — users subscribe to order updates and receive Telegram messages when events occur
- **Monthly scoping** — one shared order per domain per month (deterministic run IDs like `diapers-2025-07`)
- **Ngrok tunneling** — automatic tunnel setup for Telegram webhooks and external provider callbacks

## Architecture

```
Telegram ──► Mostro Supervisor
                 ├──► Diapers Agent  ──► Diapers Workflow  (3 steps, 1 suspend)
                 ├──► Meds Agent     ──► Meds Workflow     (6 steps, 3 suspends)
                 └──► Refunds Agent  ──► Refunds Workflow  (8 steps, 3 suspends)
                          ▲
                          │ webhooks resume suspended steps
                 External Systems
```

### Agents

| Agent                 | Description                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| **Mostro Supervisor** | Receives all Telegram messages, delegates to domain agents, relays notification signals to subscribers   |
| **Diapers Agent**     | Manages the shared diaper order flow — request, check status, subscribe to updates                       |
| **Meds Agent**        | Manages medication orders based on prescriptions — request, track pharmacy acknowledgements and delivery |
| **Refunds Agent**     | Manages refund requests — submit, track acknowledgement, confirmation, and deposit                       |

### Workflows

Each domain workflow follows a request → wait → notify pattern with external webhook-driven resume points:

- **Diapers**: `requested → date_confirmed → notification_sent`
- **Meds**: `prescriptions_received → requested → acknowledged → ack_notified → delivery_confirmed → notification_sent`
- **Refunds**: `requested → acknowledged → ack_notified → confirmed → confirmation_notified → deposit_received → deposit_confirmed → notification_sent`

### Webhook Endpoints

| Endpoint                              | Purpose                            |
| ------------------------------------- | ---------------------------------- |
| `POST /webhooks/diapers`              | Delivery date confirmation         |
| `POST /webhooks/meds/ack`             | Pharmacy acknowledgement           |
| `POST /webhooks/meds/confirm`         | Medication delivery confirmation   |
| `POST /webhooks/refunds/ack`          | Refund acknowledgement             |
| `POST /webhooks/refunds/confirmation` | Refund confirmation with reference |
| `POST /webhooks/refunds/deposit`      | Deposit received                   |

## Tech Stack

- **[Mastra](https://mastra.ai/)** — AI agent framework (agents, workflows, tools, memory, observability)
- **[DeepSeek v4 Flash](https://deepseek.com/)** via OpenRouter — LLM provider
- **[@chat-adapter/telegram](https://www.npmjs.com/package/@chat-adapter/telegram)** — Telegram bot integration
- **LibSQL** — workflow state persistence and agent memory
- **DuckDB** — observability and tracing
- **ngrok** — tunnel for webhook delivery
- **Zod** — schema validation

## Prerequisites

- Node.js >= 22.13.0
- [pnpm](https://pnpm.io/)
- An [OpenRouter](https://openrouter.ai/) API key
- A [Telegram Bot](https://core.telegram.org/bots#how-do-i-create-a-bot) token
- An [ngrok](https://ngrok.com/) account with a reserved domain

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/alex-bluetrain/mostro.git
   cd mostro
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy the environment file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   ```env
   OPENROUTER_API_KEY=
   TELEGRAM_BOT_USERNAME=
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_WEBHOOK_SECRET_TOKEN=
   NGROK_AUTHTOKEN=
   NGROK_DOMAIN=
   ```

   Optional — external provider endpoints for outbound messaging:

   ```env
   DIAPERS_MESSAGING_URL=
   MEDS_MESSAGING_URL=
   REFUNDS_MESSAGING_URL=
   ```

4. Start the development server:

   ```bash
   pnpm run dev
   ```

   This starts the Mastra dev server with [Mastra Studio](https://mastra.ai/docs/studio/overview) at `http://localhost:4111`.

## Project Structure

```
src/mastra/
├── agents/           Domain agents + supervisor
├── tools/            3 tools per domain (request, get-status, subscribe)
├── workflows/        Suspend/resume workflows with steps, schemas, and types
│   ├── diapers/
│   ├── meds/
│   └── refunds/
├── routes/           Webhook endpoints that resume suspended workflows
├── lib/              Run helpers, subscriber stores, date utilities
├── config/           Zod-validated environment configuration
└── index.ts          Central registration (agents, workflows, routes, storage)
```

## Scripts

| Script           | Description                              |
| ---------------- | ---------------------------------------- |
| `pnpm run dev`   | Start development server with hot reload |
| `pnpm run build` | Build for production                     |
| `pnpm run start` | Start production server                  |

## License

Private
