# Mostro

<p align="center">
  <img src="img/agents.png" alt="Mostro"/>
</p>

A multi-agent Telegram bot for managing recurring family orders — diapers, medications, and refunds — built with [Mastra](https://mastra.ai/).

Mostro uses a **supervisor/delegation architecture**: a central supervisor agent receives Telegram messages and routes them to specialized domain agents. Each domain agent orchestrates a workflow with **suspend/resume semantics** — workflows pause at specific steps waiting for external webhook callbacks, then notify subscribed users when milestones are reached.

## Features

- **Supervisor pattern** — single entry point that delegates to domain-specific agents based on intent
- **Invite-only access** — canonical user identity keyed by Google email; unknown Telegram senders are silently ignored, admins invite people via one-time deep links (see [docs/identity.md](docs/identity.md))
- **Google SSO for the web** — the Mastra server authorizes logins against the same users collection as the bot
- **Suspend/resume workflows** — long-running order flows that halt until external systems call back via webhooks
- **Notification subscriptions** — users subscribe to order updates and receive Telegram messages when events occur
- **Monthly scoping** — one shared order per domain per month (deterministic run IDs like `diapers-2025-07`)
- **Ngrok tunneling** — automatic tunnel setup for Telegram webhooks and external provider callbacks

## Architecture

```
Telegram ──► access gate ──► Mostro Supervisor
                 ├──► Weather Agent  ──► Weather Workflow
                 ├──► Diapers Agent  ──► Diapers Workflow  (3 steps, 1 suspend)
                 ├──► Meds Agent     ──► Meds Workflow     (6 steps, 3 suspends)
                 └──► Refunds Agent  ──► Refunds Workflow  (8 steps, 3 suspends)
                          ▲
                          │ webhooks resume suspended steps
                 External Systems
```

Only known users get past the access gate; identity, invites, and memory ownership are covered in [docs/identity.md](docs/identity.md).

### Agents

| Agent                 | Description                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Mostro Supervisor** | Receives all Telegram messages, delegates to domain agents, relays notification signals to subscribers, handles invites |
| **Weather Agent**     | Provides weather details for a location and suggests activities based on the forecast                                   |
| **Diapers Agent**     | Manages the shared diaper order flow — request, check status, subscribe to updates                                      |
| **Meds Agent**        | Manages medication orders based on prescriptions — request, track pharmacy acknowledgements and delivery                |
| **Refunds Agent**     | Manages refund requests — submit, track acknowledgement, confirmation, and deposit                                      |

### Workflows

Each domain workflow follows a request → wait → notify pattern with external webhook-driven resume points:

- **Diapers**: `requested → date_confirmed → notification_sent`
- **Meds**: `requested → acknowledged → ack_notified → delivery_confirmed → notification_sent`
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
- **MongoDB** — workflow state, agent memory, users, and invites
- **DuckDB** — observability and tracing
- **ngrok** — tunnel for webhook delivery
- **Zod** — schema validation
- **[Gmail API](https://developers.google.com/gmail/api)** vía `@googleapis/gmail` — envío de correos salientes

## Prerequisites

- Node.js >= 22.13.0
- [pnpm](https://pnpm.io/)
- A [MongoDB](https://www.mongodb.com/) instance
- An [OpenRouter](https://openrouter.ai/) API key
- A [Telegram Bot](https://core.telegram.org/bots#how-do-i-create-a-bot) token
- An [ngrok](https://ngrok.com/) account with a reserved domain
- Optional: a Google OAuth client ("Web application") for web login

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
   MONGODB_URI=
   MONGODB_DB_NAME=
   NGROK_AUTHTOKEN=
   NGROK_DOMAIN=
   ADMIN_EMAIL=
   ADMIN_NAME=
   ADMIN_TELEGRAM_ID=
   ```

   `ADMIN_EMAIL` seeds the first authorized user on boot — without it nobody can talk to the bot or log into the web. See [docs/identity.md](docs/identity.md) for how identity and invites work. Note: optional variables must be absent, not empty — an empty value fails zod validation and aborts the boot.

   Optional — Google SSO for the web (Studio and future frontends):

   ```env
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_REDIRECT_URI=
   GOOGLE_COOKIE_PASSWORD=
   ```

   Required — Gmail, para el envío de correos salientes:

   ```env
   GMAIL_CLIENT_ID=
   GMAIL_CLIENT_SECRET=
   GMAIL_REFRESH_TOKEN=
   GMAIL_SENDER=
   DIAPERS_EMAIL_TO=
   MEDS_EMAIL_TO=
   REFUNDS_EMAIL_TO=
   ```

   Setup de la cuenta de Gmail, una sola vez:

   1. Crear un proyecto de Google Cloud propio del mailer, separado del que usa el SSO.
   2. Habilitar la Gmail API.
   3. Crear un cliente OAuth de tipo "Web application" con redirect a
      `http://localhost:53682/oauth2callback` (la URI debe coincidir exactamente, puerto incluido).
   4. Agregar el scope `https://www.googleapis.com/auth/gmail.send`.
   5. **Publicar la app en producción.** En modo *Testing* el refresh token se invalida a los 7
      días y los envíos empiezan a fallar. Al autorizar aparece la pantalla de "app no
      verificada", que se acepta manualmente.
   6. Correr `pnpm run gmail:auth` con la cuenta de Mostro y guardar el token en el `.env`.

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
├── lib/              Users, invites, telegram gate, Google auth, run helpers, subscriber stores
├── config/           Zod-validated environment configuration
└── index.ts          Central registration (agents, workflows, routes, storage)
```

## Scripts

| Script           | Description                              |
| ---------------- | ---------------------------------------- |
| `pnpm run dev`   | Start development server with hot reload |
| `pnpm run build` | Build for production                     |
| `pnpm run start` | Start production server                  |
| `pnpm run gmail:auth` | Obtiene el refresh token de Gmail (one-time) |

## License

Private
