# Request author required — Design

**Date:** 2026-07-24
**Status:** Approved

## Problem

Shared orders (diapers, meds, refunds) record who placed them in `requestedBy`, but the value is optional end-to-end and silently degrades to `undefined`:

- The request tools resolve the caller with `getUserByResourceId(resourceId)` and pass `requestedBy: user?.name || undefined`. If the user cannot be resolved — or resolves to a user whose `name` is `""` — the order is created anonymously.
- A user's `name` is `""` far more often than expected: `upsertFromInviteRedeem` provisions every invited user with a hardcoded `name: ''`, and the invite itself never carries a name (`createInviteTool` only takes an email). The intended path was to ask for the name in chat and save it with `setMyNameTool`, but a user who never answers keeps `name: ""` (e.g. the real user `vaninalonsochef@gmail.com`).

Two changes, together: capture a real name automatically at redeem time, and make `requestedBy` mandatory so no order can be placed without an identified author.

## Part 1 — Capture the Telegram name at redeem

The `/start` handler already receives the sender's Telegram display name: the Chat SDK's `SlashCommandEvent.user` is an `Author` with a `fullName` field. `telegram-start.ts` currently discards it — its local `TelegramStartEvent` type only declares `user: { userId: string }`.

- **`src/mastra/lib/telegram-start.ts`**: add `fullName: string` to `TelegramStartEvent['user']`. Pass it through when provisioning: `provisionUser(invite.email, telegramId, event.user.fullName.trim())`. The `provisionUser` dep signature gains a `name` parameter.
- **`src/business/repositories/user.repository.ts`**: `upsertFromInviteRedeem(email, telegramId, name)` writes that name into `$setOnInsert` instead of `name: ''`.

Behavior notes:
- **Only new users get the name.** `name` lives in `$setOnInsert`, so an email that already exists (admin seed, legacy) keeps its current name and only gets its `telegramId` linked.
- **Empty stays empty.** If `fullName` trims to `""` (rare on Telegram), the user is still created with `name: ''` and the existing welcome keeps asking for the name — the chat-based correction path is preserved.
- **Welcome unchanged.** `buildWelcomeMessage(user.name || invite.name)` already greets by name when present and only asks for it when absent. No change needed.

## Part 2 — `requestedBy` mandatory (diapers, meds, refunds)

### a) Guard in the three request tools

In `diapers-request-tool.ts`, `meds-request-tool.ts`, `refunds-request-tool.ts`, after resolving `user`, reject before starting the workflow when there is no usable name (unresolved user, or `name` empty/whitespace):

```ts
const user = resourceId ? await getUserByResourceId(resourceId) : null
if (!user?.name?.trim()) {
    return {
        ok: false,
        reason: 'requester_unidentified',
        message: 'Todavía no sé tu nombre, así que no registré el pedido. ¿Cómo te llamás?',
    }
}
return startDiapers(context.mastra as any, { ...input, requestedBy: user.name.trim() })
```

The `{ ok, reason, message }` shape is interpretable by the LLM agents: the sub-agent relays `message`, the supervisor acts on `reason`.

### b) Mandatory schemas and signatures

Mongo is a disposable sandbox and will be wiped, so there are no historical runs to keep readable — every layer becomes required (`z.string().min(1)`, no `.optional()`).

**Mastra constraint (verified in source, `chunk-PQ5PN4TW.js:18323`):** `run.start` validates the initial state — `initialState ?? {}` — against the workflow's `stateSchema`. A required `requestedBy` with no default therefore makes the empty initial state fail and the workflow never starts. The fix is to pass the author in `initialState` at start time so the initial state already satisfies the schema:

- **State schemas** (`diapers-state.schema.ts`, `refunds-state.schema.ts`, `meds-state.schema.ts`): `requestedBy: z.string().min(1)` (required, no default).
- **Start functions** pass `initialState: { requestedBy }` alongside `inputData`, and their signatures change `requestedBy?: string` to `requestedBy: string`:
  - `startDiapers`: `run.start({ inputData: { size, requestedBy }, initialState: { requestedBy } })`
  - `startRefundRequest`: `run.start({ inputData: { amount, reason, requestedBy }, initialState: { requestedBy } })`
  - `startMedsOrder`: `run.start({ inputData: { medications, requestedBy }, initialState: { requestedBy } })` — see the meds restructure below.
- **Input schemas**: `request-diapers-input.schema.ts`, `request-refund-input.schema.ts`, and the meds workflow input (`meds-workflow-input.schema.ts`) all require `requestedBy: z.string().min(1)`.

### b.1) Meds restructure — drop `wait-prescriptions`

Meds currently starts with an empty input and immediately suspends on `wait-prescriptions`, then `startMedsOrder` resumes with the medications the tool already had — a vestigial suspend/resume. To make meds start with its author like the other two flows, `wait-prescriptions` is removed:

- **`meds-workflow-input.schema.ts`**: `z.object({ medications: z.array(z.string()), requestedBy: z.string().min(1) })` (was empty).
- **`request-meds.step.ts`** becomes the first step: its `inputSchema` is the workflow input; it sets `medications`, `requestedBy`, `status: 'meds_requested'`, `requestedAt`, and keeps the messaging `fetch` (reading `inputData.medications`).
- **`meds.workflow.ts`**: chain starts at `requestMedsStep` (drop `.then(waitPrescriptionsStep)`).
- **`startMedsOrder`**: single `run.start`, no `resume`.
- **Delete**: `wait-prescriptions.step.ts`, `wait-prescriptions-resume.schema.ts`.
- **`meds-state.schema.ts`**: remove the now-unreachable `'prescriptions_received'` status and `prescriptionsReceivedAt` field.
- **`meds-agent.ts`**: drop "prescriptions received" from the status wording.

### c) Instructions across two layers

The request tools live on the sub-agents; `setMyNameTool` lives on the supervisor. The rejection signal must cross both:

- **Sub-agents** (`diapers-agent.ts`, `meds-agent.ts`, `refunds-agent.ts`): "If `requestXTool` returns `reason: 'requester_unidentified'`, do not retry — relay its `message` to the user."
- **Supervisor** (`mostro-supervisor.ts`): "If an order was not registered because the user's name is missing, ask for the name, save it with `setMyNameTool`, then delegate the order again." (Reinforces the existing name-saving rule.)

## Error handling

- The tool guard returns a structured object; it does not throw. Existing behavior for `alreadyInProgress` and successful starts is unchanged.
- Telegram redeem stays wrapped in the handler's try/catch; a missing/empty `fullName` degrades to `''` rather than failing.

## Testing

- **`telegram-start`** tests: events carry `fullName`; a redeem persists the Telegram name; empty `fullName` still provisions with `''`.
- **`user.repository`** tests: `upsertFromInviteRedeem` stores the passed name and does not overwrite an existing user's name.
- **Request tools** tests: guard rejects with `requester_unidentified` when the user is unresolved or `name` is empty/whitespace; passes `requestedBy` through when the name is valid.
- **Schema** tests: input and state schemas reject missing/empty `requestedBy`.
- **Meds restructure**: `startMedsOrder` starts the workflow directly (no resume) and the run reaches `meds_requested` with `medications` and `requestedBy` set; the meds workflow input schema rejects a call without `requestedBy`.

## Out of scope

- Backfilling existing users with empty names (e.g. Vanina) — handled manually / by wiping the sandbox DB.
- Deriving the name from the Google profile at authentication time (desirable long-term, but the redeem happens over Telegram before any Google login).
- Automatic retry of the order by the supervisor is described as behavior guidance, not enforced in code.
