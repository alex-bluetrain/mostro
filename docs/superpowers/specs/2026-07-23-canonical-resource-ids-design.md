# Canonical resource ids (user email) — Design

Date: 2026-07-23
Status: Approved

## Context

Resource ids currently come in two formats: the canonical user email (new DM
threads, via the supervisor's `resolveResourceId`) and the legacy
`telegram:<id>` (old threads, channel default). `src/business/identity.ts`
bridges both at runtime via `parseResourceId`.

The database will be wiped manually, so no data migration is needed. Groups
are not used in practice, so the `isDM` distinction is irrelevant.

## Goal

Every resource id is the user's email (or its sub-agent derivative
`<email>-<agentKey>`). The `telegram:<id>` format disappears from the code.

## Decisions

- **Strict, no fail-safe**: if `resolveResourceId` cannot map the Telegram
  author to a user, it throws instead of falling back to the channel default.
  The Telegram gate already rejects unknown senders before this point, so a
  failed lookup means a bug or a DB failure — it must be loud, not a silently
  orphaned thread.
- No `isDM` check: every thread resolves to the author's email.
- Non-email resource ids reaching `identity.ts` resolve to `null`, and tools
  already surface that as "unknown user" (visible, not silent).

## Changes

### 1. `src/mastra/agents/mostro-supervisor.ts` — `resolveResourceId`

Drop the `isDM` check and the `defaultResourceId` fallback. Always:
`findByTelegramId(message.author.userId)` → return `user.email`; if no user,
throw an error that includes the telegramId. Update the comment to state the
invariant: every resource id is an email.

### 2. `src/business/identity.ts` — email-only

- Remove `ParsedResourceId` and `parseResourceId` (the dual-format concept).
  Replace with a simple helper `emailFromResourceId(resourceId): string | null`:
  strip the sub-agent suffix (unchanged logic), trim/lowercase, return the
  value if it contains `@`, else `null`.
- `getUserByResourceId` → `findByEmail` only.
- `setUserNameByResourceId` → `setUserName(email, name)` directly, no
  intermediate telegramId lookup.
- `stripSubAgentSuffix` stays as-is: sub-agent delegation still derives
  `<email>-<agentKey>` ids, and only registered keys are stripped so unknown
  suffixes stay visible as errors.

### 3. No changes

Telegram gate, `telegram-start`, tools, workflows, and
`subscriber.repository` already treat the resource id as opaque; with the DB
wiped, everything they see will be an email or email-derivative.

## Error handling

- `resolveResourceId` throw → thread creation fails and lands in logs.
- Non-email resource id → `null` from `identity.ts` → tools report unknown
  user.

## Testing

New `src/business/identity.test.ts` covering:

- plain email resolves (trimmed/lowercased)
- email with a registered sub-agent suffix (`ana@gmail.com-diapersAgent`)
  strips to the plain email
- unknown suffix is not stripped
- non-email input returns `null`

Existing tests (`create-invite-tool.test.ts`, gate/start tests) already use
emails and should not break.
