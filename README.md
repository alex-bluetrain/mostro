# Mostro

<p align="center">
  <img src="img/agents.png" alt="Mostro"/>
</p>

A multi-agent Telegram bot for managing recurring family orders — diapers, medications, and refunds — built with [Mastra](https://mastra.ai/).

Mostro uses a **supervisor/delegation architecture**: a central supervisor agent receives Telegram messages and routes them to specialized domain agents. Each domain agent orchestrates a workflow with **suspend/resume semantics** — workflows pause at specific steps until Mostro's own mailbox-polling cycle finds and matches a reply, then notify subscribed users when milestones are reached.

## Features

- **Supervisor pattern** — single entry point that delegates to domain-specific agents based on intent
- **Invite-only access** — canonical user identity keyed by Google email; unknown Telegram senders are silently ignored, admins invite people via one-time deep links (see [docs/identity.md](docs/identity.md))
- **Google SSO for the web** — the Mastra server authorizes logins against the same users collection as the bot
- **Suspend/resume workflows** — long-running order flows that halt at a step until a matching reply is found in Mostro's own mailbox
- **Mailbox polling** — a scheduled workflow per domain reads Mostro's Gmail inbox every 15 minutes, matches replies to the suspended step of the run they belong to, and resumes it — see [Mailbox Polling](#mailbox-polling) below
- **Outbound email** — orders reach suppliers as real emails sent from Mostro's own Gmail account, so replies land in its inbox; a send that fails leaves the order un-placed and retryable rather than silently marked as sent
- **Notification subscriptions** — users subscribe to order updates and receive Telegram messages when events occur
- **Monthly scoping** — one shared order per domain per month (deterministic run IDs like `diapers-2025-07`)
- **Ngrok tunneling** — automatic tunnel setup for Telegram's webhook delivery

## Architecture

```
Telegram ──► access gate ──► Mostro Supervisor
                 ├──► Weather Agent  ──► Weather Workflow
                 ├──► Diapers Agent  ──► Diapers Workflow  (3 steps, 1 suspend)
                 ├──► Meds Agent     ──► Meds Workflow     (6 steps, 3 suspends)
                 └──► Refunds Agent  ──► Refunds Workflow  (8 steps, 3 suspends)
                          ▲ │
                          │ └──► email (Gmail API) ──► suppliers
                          │
              Diapers/Meds/Refunds Poll Workflows (cron, every 15 min)
                          │
                 reads Mostro's own Gmail inbox, resumes the matching run
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

Each domain workflow follows a request → wait → notify pattern with mailbox-polling-driven resume points:

- **Diapers**: `requested → date_confirmed → notification_sent`
- **Meds**: `requested → acknowledged → ack_notified → delivery_confirmed → notification_sent`
- **Refunds**: `requested → acknowledged → ack_notified → confirmed → confirmation_notified → deposit_received → deposit_confirmed → notification_sent`

### Mailbox Polling

There is no inbound webhook for suppliers to call. Instead, one poll workflow per domain
(`diapers-poll`, `meds-poll`, `refunds-poll`) runs on a 15-minute Mastra `schedule`. Each cycle
orchestrates three independent modules:

1. **`inbox-manager`** (`src/mastra/lib/inbox-manager/`) — the only module that talks to Gmail.
   Translates a natural-language query description into Gmail search syntax once, fetches
   unprocessed replies (anything without an `outcome.*` status label), and applies labels.
2. **`mail-classifier`** (`src/mastra/lib/mail-classifier/`) — classifies each mail and extracts
   structured data via LLM, driven by **versioned classification rules stored in MongoDB**, read
   fresh on every cycle — publish a new rules snapshot and the next cycle picks it up, no redeploy.
3. **`outcome-processor`** (`src/mastra/lib/outcome-processor/`) — runs the side effect registered
   in code for the classified label (resuming the matching suspended workflow run).

Every processed mail ends up with two orthogonal labels: what it is (e.g. `diapers.confirmed`,
from the MongoDB rules) and how processing went (`outcome.completed` / `outcome.failed` /
`outcome.review`). Mails without a status label are picked up again on the next cycle
(at-least-once semantics).

Classification rules are seeded from JSON files kept **outside the repo** (they contain sensitive
data): `pnpm seed:classifier -- --domain <domain> --file <path> --author <name> --changelog <text>`.

See [docs/inbox-pipeline.md](docs/inbox-pipeline.md) for the full architecture — module
responsibilities, label semantics, MongoDB snapshot versioning, orchestration, and operational
notes — and [docs/clasificador.md](docs/clasificador.md) for the rules JSON format.

The three poll workflows still run every 15 minutes each, but on offset minutes
(`diapers-poll` at `2,17,32,47`, `meds-poll` at `7,22,37,52`, `refunds-poll` at `12,27,42,57`) so
the three domains don't hit the Gmail API at the same instant.

**When upgrading an already-deployed instance**, re-run `pnpm run gmail:auth`. An existing refresh
token minted before polling only carries the `gmail.send` scope; the pollers need `gmail.modify`
to read replies and apply labels. Without the new scope the poller gets a 403 every 15 minutes.

## Tech Stack

- **[Mastra](https://mastra.ai/)** — AI agent framework (agents, workflows, tools, memory, observability)
- **[DeepSeek v4 Flash](https://deepseek.com/)** via OpenRouter — LLM provider
- **[@chat-adapter/telegram](https://www.npmjs.com/package/@chat-adapter/telegram)** — Telegram bot integration
- **MongoDB** — workflow state, agent memory, users, invites, and classification rules
- **DuckDB** — observability and tracing
- **ngrok** — tunnel for Telegram's webhook delivery
- **Zod** — schema validation
- **[Gmail API](https://developers.google.com/gmail/api)** via `@googleapis/gmail` — sends outbound emails

## Prerequisites

- Node.js >= 22.13.0
- [pnpm](https://pnpm.io/)
- A [MongoDB](https://www.mongodb.com/) instance
- An [OpenRouter](https://openrouter.ai/) API key
- A [Telegram Bot](https://core.telegram.org/bots#how-do-i-create-a-bot) token
- An [ngrok](https://ngrok.com/) account with a reserved domain
- A Gmail account for Mostro itself — outbound orders are sent from it, and suppliers reply to it
- A Google Cloud project with the Gmail API enabled, an OAuth client, and the app published to
  production (see the one-time setup in step 3 below)
- Optional, for web login: a second OAuth client of type "Web application" — the same project can
  host it

### One project, two OAuth clients

Sending mail and logging in are separate integrations with separate credentials
(`GMAIL_MAILER_*` and `GOOGLE_SSO_*`), but they can live in one Google Cloud project.

Users logging in are never asked for Gmail access. Consent is granted per authorization request,
not per project: the login asks for `openid email profile`, while `gmail.send` is requested once,
by you, when you authorize the mailer with Mostro's own account.

What the two do share, being one project: the 100-new-user cap Google applies to an app that has
shown the "unverified app" screen — which the mailer will, since its scope is sensitive and the app
is published but unverified — plus the verification paperwork if you ever need it, and the blast
radius of a suspension. None of that binds at family scale. Split the mailer into its own project
if you ever open the login to people outside the household.

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
   GOOGLE_SSO_CLIENT_ID=
   GOOGLE_SSO_CLIENT_SECRET=
   GOOGLE_SSO_REDIRECT_URI=
   GOOGLE_SSO_COOKIE_PASSWORD=
   ```

   Required — Gmail, for sending outbound emails and for the poll workflows that read replies
   back from the same inbox:

   ```env
   GMAIL_MAILER_CLIENT_ID=
   GMAIL_MAILER_CLIENT_SECRET=
   GMAIL_MAILER_REFRESH_TOKEN=
   GMAIL_MAILER_SENDER=
   DIAPERS_EMAIL_TO=
   MEDS_EMAIL_TO=
   REFUNDS_EMAIL_TO=
   ```

   One-time Gmail account setup:

   1. Create a Google Cloud project — the same one can also host the web login's OAuth client.
   2. Enable the Gmail API.
   3. Create an OAuth client of type "Web application", **separate from the SSO one**, with a
      redirect to `http://127.0.0.1:53682/oauth2callback`. Google matches redirect URIs literally,
      so scheme, host, port and trailing slash must be exactly that — in particular `127.0.0.1`
      and not `localhost`, which on Windows resolves to IPv6 first while the script listens on
      IPv4. ("Web application" rather than "Desktop app" because the client secret lives in a
      server's `.env` and is treated as confidential.)
   4. Add the `https://www.googleapis.com/auth/gmail.send` and
      `https://www.googleapis.com/auth/gmail.modify` scopes. Sending only needs `gmail.send`;
      `gmail.modify` is what lets the poll workflows read replies and apply the classification and
      status labels (e.g. `diapers.confirmed`, `outcome.completed`). Gmail doesn't offer a scope
      narrower than "the whole mailbox" — the poller's containment is in code (a per-domain query
      description, fixed resume functions per outcome), not in the OAuth grant.
   5. **Publish the app to production.** In _Testing_ mode the refresh token is invalidated
      after 7 days and sends (and polling) start failing. Authorizing shows the "unverified app"
      screen, which you accept manually.
   6. Run `pnpm run gmail:auth` with the Mostro account and save the token in `.env`.

   `gmail:auth` runs as its own process and briefly listens on port 53682 — not Mastra's port,
   which it would collide with while `pnpm run dev` is up. The callback cannot be a Mastra route
   either: `GMAIL_MAILER_REFRESH_TOKEN` is required for the server to boot, so you would need the
   token to start the thing that gives you the token. The port number itself is arbitrary; it only
   has to match the redirect URI registered on the OAuth client.

   The consent screen's user type must be **External** — _Internal_ only exists for Google
   Workspace organizations, and Mostro's account is a plain `@gmail.com` one. Publishing the app
   is not the same as getting it verified: you can publish without verification, and authorizing
   then shows the "Google hasn't verified this app" screen, which you accept manually.

   The refresh token also dies if the Mostro account's **password changes** (Google invalidates
   tokens carrying Gmail scopes) or if it goes **six months unused**. In all of these cases sends
   fail with `invalid_grant`, and the mailer's error message says so — the fix is always to re-run
   `pnpm run gmail:auth`.

4. Seed the classification rules (once per domain, and again whenever the rules change):

   ```bash
   pnpm seed:classifier -- --domain diapers --file <path-to-rules.json> --author "you" --changelog "initial seed"
   ```

   The rules JSON lives outside the repo (it contains sensitive supplier data). Start from the
   per-domain templates in [docs/classifier-rules/](docs/classifier-rules/) — labels and extract
   schemas already match the code — and fill in the `<...>` placeholders. Without a seeded
   snapshot for a domain, that domain's poll cycle fails fast with a clear error. Format:
   [docs/clasificador.md](docs/clasificador.md).

5. Start the development server:

   ```bash
   pnpm run dev
   ```

   This starts the Mastra dev server with [Mastra Studio](https://mastra.ai/docs/studio/overview) at `http://localhost:4111`.

## Project Structure

```
src/
├── business/
│   ├── models/            Mongoose models (users, invites, classifier snapshots + pointers)
│   └── repositories/      Data access (classifier.repository: getActiveRules, publishSnapshot)
└── mastra/
    ├── agents/            Domain agents + supervisor + inboxClassifierAgent
    ├── tools/             3 tools per domain (request, get-status, subscribe)
    ├── workflows/         One directory per workflow (not per domain), suspend/resume workflows
    │   │                  with steps, schemas, and types
    │   ├── diapers/       diapers.workflow.ts
    │   ├── diapers-poll/  diapers-poll.workflow.ts (schedule, every 15 min) +
    │   │                  diapers-inbox.config.ts (query) + diapers-outcome-handlers.ts (label → handler)
    │   ├── meds/          meds.workflow.ts
    │   ├── meds-poll/     meds-poll.workflow.ts + meds-inbox.config.ts + meds-outcome-handlers.ts
    │   ├── refunds/       refunds.workflow.ts
    │   └── refunds-poll/  refunds-poll.workflow.ts + refunds-inbox.config.ts + refunds-outcome-handlers.ts
    ├── lib/
    │   ├── inbox-manager/     Gmail gateway: translates the query once, fetches replies, applies labels
    │   ├── mail-classifier/   Classifies + extracts via LLM against MongoDB-stored rules (ajv-validated)
    │   ├── outcome-processor/ Runs the handler registered in code for a classified label
    │   ├── *-run.ts           Resume functions per domain, guarded by run + suspended + right step
    │   └── ...                Users, invites, telegram gate, Google auth, subscriber stores
    ├── config/            Zod-validated environment configuration
    └── index.ts           Central registration (agents, workflows, storage)
```

## Scripts

| Script                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `pnpm run dev`         | Start development server with hot reload           |
| `pnpm run build`       | Build for production                               |
| `pnpm run start`       | Start production server                            |
| `pnpm run gmail:auth`  | Get the Gmail refresh token (one-time)             |
| `pnpm seed:classifier` | Publish a classification-rules snapshot to MongoDB |

## License

Private
