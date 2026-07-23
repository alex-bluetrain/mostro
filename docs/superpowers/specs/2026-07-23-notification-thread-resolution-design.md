# Notification thread resolution — design

**Date:** 2026-07-23
**Status:** Approved

## Problem

Subscription-based notifications (diapers / meds / refunds) never reach the user
on Telegram. The notify steps send the notification signal, the supervisor wakes
and even generates the relay message — but everything happens in the wrong
thread.

Root cause: the subscribe tools run *inside* the sub-agents, so
`context.agent.resourceId` / `context.agent.threadId` capture the **derived
sub-agent thread** (`${email}-diapersAgent` / `${parentThreadId}-${childUuid}`),
not the channel-bound supervisor thread. The notify steps then signal those
derived coordinates. The channel renderer only forwards output for threads whose
metadata carries `channel_platform` / `channel_externalThreadId`; derived
sub-agent threads have none, so the message dies there.

Verified end to end against the local DB: the derived thread contains the signal
and the generated relay message; the Telegram-bound thread
(`resourceId: <email>`, `metadata.channel_externalThreadId: telegram:<telegramId>`)
never saw them.

## Design

Store only the canonical identity; resolve the delivery thread at send time
using the same mechanism Mastra uses internally for inbound messages
(`listThreads` filtered by `metadata.channel_externalThreadId`).

### Subscription (write side)

- The three subscribe tools (`diapers`, `meds`, `refunds`) resolve the caller to
  the canonical email with `emailFromResourceId` (`src/business/identity.ts`),
  which already strips the `-<subAgentKey>` suffix.
- `subscribers` documents store `{ type, email }` only. The `threadId` field is
  removed — it was a fragile copy of information that is now resolved at send
  time.
- `SubscriberRepository` API changes accordingly: `add(domain, email)`,
  `list(domain): string[]` (emails). Unique index becomes `{ type, email }`.
- If `emailFromResourceId` returns `null` (no `@`), the tool returns
  `{ subscribed: false }` — same contract as today's missing-context case.

### Notification (read side)

New helper `src/mastra/lib/resolve-telegram-thread.ts`:

1. `userRepository.findByEmail(email)` → user with `telegramId`.
2. Build the deterministic external id `telegram:${telegramId}` (a Telegram DM's
   external thread id, as produced by the adapter's `openDM`).
3. Look up the internal thread via the Mastra storage memory store:
   `listThreads({ filter: { metadata: { channel_externalThreadId } }, perPage: 1 })`.
4. Return `{ resourceId: email, threadId: thread.id }`, or `null` when the user
   or thread doesn't exist (user never talked to the bot) — the caller logs and
   skips that subscriber.

All six notify steps (diapers confirmation; meds ack + confirmation; refunds
ack + confirmation + deposit) iterate the subscribed emails, resolve the thread
through the helper, and call `supervisor.sendNotificationSignal(...)` with the
resolved coordinates. Signal content/framing is unchanged.

The helper needs access to the storage memory store; it receives the `mastra`
instance the steps already get in `execute` (`mastra.getStorage()` →
`getStore('memory')`).

## Error handling

- Unknown email at notify time (user deleted, no telegram thread yet): log a
  warning and skip; `notifiedCount` counts only actually-sent signals.
- `emailFromResourceId` null at subscribe time: `{ subscribed: false }`.
- Thread lookup failures throw as usual — workflow steps surface them.

## Data cleanup

- Delete all existing `subscribers` documents: every one stores derived
  sub-agent ids and is undeliverable. No migration — resubscribing is a
  one-liner in chat.
- Drop the old `{ type, resourceId, threadId }` unique index (schema change
  recreates it as `{ type, email }`).
- Remove the uncommitted debug `console.log` in `diapers-subscribe-tool.ts`.

## Testing

- `subscriber.repository.test.ts`: update to the new shape (email-only,
  idempotent upsert per `{type, email}`).
- New unit tests for `resolve-telegram-thread` with stubbed user repository and
  memory store: happy path, unknown user, missing thread.
- Manual end-to-end: subscribe via Telegram, run the diapers workflow to
  confirmation, verify the notice arrives in the Telegram chat.

## Out of scope

- Non-Telegram delivery channels (future web): the helper is Telegram-specific
  by name and contract; a future channel adds its own resolver.
- Notifying multiple threads per user.
