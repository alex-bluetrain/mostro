# Telegram `/start` Invite Redeem Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make invite redemption work by handling Telegram's `/start <code>` through the Chat SDK's slash-command pipeline instead of the message gate, which never receives it.

**Architecture:** The `@chat-adapter/telegram` adapter diverts `bot_command` messages to `chat.processSlashCommand`, so `/start <code>` never reaches `onDirectMessage`. We register a `/start` handler via `agent.getChannels().sdk.onSlashCommand('/start', ...)` (the Chat SDK's public API) that redeems the invite, links the telegram id, and posts a fixed welcome. The `onDirectMessage` gate is simplified to a pure known-sender check.

**Tech Stack:** Mastra 1.x channels (`AgentChannels`), Chat SDK (`chat` package), Mongoose repositories, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-telegram-start-invite-redeem-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm test`, `pnpm dev`) — never npm.
- User-facing bot copy is in español rioplatense (exact strings given in Task 1).
- Commit messages in English, no co-authorship lines.
- Handler failures must never throw out of the webhook path: top-level try/catch with `[telegram-start]` log prefix.
- Repository logic (`inviteRepository.redeem`, `userRepository.linkTelegramId`, `userRepository.findByTelegramId`) is reused as-is — no changes to `src/business/`.

---

### Task 1: `/start` slash-command handler

**Files:**
- Create: `src/mastra/lib/telegram-start.ts`
- Test: `tests/telegram-start.test.ts`

**Interfaces:**
- Consumes: `userRepository.findByTelegramId(telegramId): Promise<IUser | null>`, `inviteRepository.redeem(code, telegramId): Promise<IInvite | null>`, `userRepository.linkTelegramId(email, telegramId): Promise<boolean>` — all existing, from `src/business/repositories`.
- Produces: `createTelegramStartHandler(deps?: TelegramStartDeps): (event: TelegramStartEvent) => Promise<void>` plus exported constants `KNOWN_USER_GREETING`, `INVALID_INVITE_MESSAGE` and `buildWelcomeMessage(name?: string): string`. Task 4 registers the handler; the event type is a structural subset of the Chat SDK's `SlashCommandEvent`, so it is directly assignable to `onSlashCommand`.

- [ ] **Step 1: Write the failing tests**

Create `tests/telegram-start.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import {
    buildWelcomeMessage,
    createTelegramStartHandler,
    KNOWN_USER_GREETING,
    INVALID_INVITE_MESSAGE,
    type TelegramStartDeps,
} from '../src/mastra/lib/telegram-start'
import type { IUser, IInvite } from '../src/business'

const member: IUser = { email: 'ana@gmail.com', telegramId: '111', name: 'Ana', role: 'member', addedAt: 1 }
const validInvite: IInvite = { code: 'abc123XYZ_-9', email: 'nueva@gmail.com', name: 'Nueva', createdBy: 'admin@gmail.com', createdAt: 1, expiresAt: 2, usedBy: '222' }

function makeDeps(overrides: Partial<TelegramStartDeps> = {}): TelegramStartDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
        redeemInvite: vi.fn(async () => null),
        linkTelegramId: vi.fn(async () => true),
        ...overrides,
    }
}

function makeEvent(senderId: string, text: string) {
    const post = vi.fn(async () => ({}))
    return { event: { user: { userId: senderId }, text, channel: { post } }, post }
}

describe('buildWelcomeMessage', () => {
    it('con nombre saluda por nombre y no pregunta el nombre', () => {
        const msg = buildWelcomeMessage('Nueva')
        expect(msg).toContain('Nueva')
        expect(msg).not.toContain('¿cómo te llamás?')
    })

    it('sin nombre pregunta el nombre', () => {
        expect(buildWelcomeMessage()).toContain('¿cómo te llamás?')
    })
})

describe('createTelegramStartHandler', () => {
    it('usuario conocido recibe saludo de regreso sin canjear nada', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const { event, post } = makeEvent('111', '')
        await createTelegramStartHandler(deps)(event)
        expect(post).toHaveBeenCalledExactlyOnceWith(KNOWN_USER_GREETING)
        expect(deps.redeemInvite).not.toHaveBeenCalled()
    })

    it('desconocido con código válido canjea, linkea y recibe la bienvenida', async () => {
        const deps = makeDeps({ redeemInvite: vi.fn(async () => validInvite) })
        const { event, post } = makeEvent('222', 'abc123XYZ_-9')
        await createTelegramStartHandler(deps)(event)
        expect(deps.redeemInvite).toHaveBeenCalledWith('abc123XYZ_-9', '222')
        expect(deps.linkTelegramId).toHaveBeenCalledWith('nueva@gmail.com', '222')
        expect(post).toHaveBeenCalledExactlyOnceWith(buildWelcomeMessage('Nueva'))
    })

    it('desconocido con código inválido/vencido/usado recibe el mensaje genérico', async () => {
        const deps = makeDeps()
        const { event, post } = makeEvent('222', 'abc123XYZ_-9')
        await createTelegramStartHandler(deps)(event)
        expect(deps.linkTelegramId).not.toHaveBeenCalled()
        expect(post).toHaveBeenCalledExactlyOnceWith(INVALID_INVITE_MESSAGE)
    })

    it('desconocido sin código recibe el mensaje genérico sin intentar canje', async () => {
        const deps = makeDeps()
        const { event, post } = makeEvent('222', '   ')
        await createTelegramStartHandler(deps)(event)
        expect(deps.redeemInvite).not.toHaveBeenCalled()
        expect(post).toHaveBeenCalledExactlyOnceWith(INVALID_INVITE_MESSAGE)
    })

    it('canje válido pero sin user destinatario recibe el mensaje genérico', async () => {
        const deps = makeDeps({
            redeemInvite: vi.fn(async () => validInvite),
            linkTelegramId: vi.fn(async () => false),
        })
        const { event, post } = makeEvent('222', 'abc123XYZ_-9')
        await createTelegramStartHandler(deps)(event)
        expect(post).toHaveBeenCalledExactlyOnceWith(INVALID_INVITE_MESSAGE)
    })

    it('un error de las deps no revienta el handler', async () => {
        const deps = makeDeps({
            getUserByTelegramId: vi.fn(async () => {
                throw new Error('mongo down')
            }),
        })
        const { event } = makeEvent('222', 'abc123XYZ_-9')
        await expect(createTelegramStartHandler(deps)(event)).resolves.toBeUndefined()
    })
})
```

Note: the concurrent double-redeem guarantee (one winner) is the repository's atomic `findOneAndUpdate`, already covered by `src/business/repositories/invite.repository.test.ts` — at the handler level "already used" is just `redeem` returning `null` (third test).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/telegram-start.test.ts`
Expected: FAIL — cannot resolve `../src/mastra/lib/telegram-start`.

- [ ] **Step 3: Write the implementation**

Create `src/mastra/lib/telegram-start.ts`:

```typescript
import { userRepository, inviteRepository } from '../../business/repositories'
import type { IUser, IInvite } from '../../business'

export type TelegramStartDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    redeemInvite: (code: string, telegramId: string) => Promise<IInvite | null>
    linkTelegramId: (email: string, telegramId: string) => Promise<boolean>
}

const defaultDeps: TelegramStartDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    redeemInvite: (code, telegramId) => inviteRepository.redeem(code, telegramId),
    linkTelegramId: (email, telegramId) => userRepository.linkTelegramId(email, telegramId),
}

// Subconjunto estructural de SlashCommandEvent del Chat SDK: alcanza para el
// handler y permite testearlo sin fabricar un evento completo.
export type TelegramStartEvent = {
    user: { userId: string }
    text: string
    channel: { post: (message: string) => Promise<unknown> }
}

export const KNOWN_USER_GREETING = '¡Hola de nuevo! Contame en qué te ayudo.'
export const INVALID_INVITE_MESSAGE =
    'No tengo una invitación válida para vos. Pedile a quien te invitó que te genere un link nuevo.'

export function buildWelcomeMessage(name?: string): string {
    const greeting = name ? `¡Hola, ${name}!` : '¡Hola!'
    const intro =
        'Soy Mostro: te ayudo con los pedidos de pañales, medicamentos y reintegros, y te aviso cuando hay novedades.'
    return name ? `${greeting} ${intro}` : `${greeting} ${intro} Para arrancar, ¿cómo te llamás?`
}

// El adapter de telegram desvía los bot_command al pipeline de slash commands
// del Chat SDK, así que el canje de invitaciones vive acá y no en el gate de
// onDirectMessage (que nunca ve los /start).
export function createTelegramStartHandler(deps: TelegramStartDeps = defaultDeps) {
    return async (event: TelegramStartEvent): Promise<void> => {
        try {
            const telegramId = event.user.userId
            const known = await deps.getUserByTelegramId(telegramId)
            if (known) {
                await event.channel.post(KNOWN_USER_GREETING)
                return
            }
            const code = event.text.trim()
            if (!code) {
                await event.channel.post(INVALID_INVITE_MESSAGE)
                return
            }
            const invite = await deps.redeemInvite(code, telegramId)
            if (!invite) {
                await event.channel.post(INVALID_INVITE_MESSAGE)
                return
            }
            const linked = await deps.linkTelegramId(invite.email, telegramId)
            if (!linked) {
                console.warn(`[telegram-start] invite ${invite.code} redeemed but no user found for ${invite.email}`)
                await event.channel.post(INVALID_INVITE_MESSAGE)
                return
            }
            await event.channel.post(buildWelcomeMessage(invite.name))
        } catch (err) {
            console.error('[telegram-start] failed to handle /start', err)
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/telegram-start.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/telegram-start.ts tests/telegram-start.test.ts
git commit -m "feat: add /start slash-command handler for invite redemption"
```

---

### Task 2: Simplify the message gate

**Files:**
- Modify: `src/mastra/lib/telegram-gate.ts`
- Test: `tests/telegram-gate.test.ts`

**Interfaces:**
- Produces: `createTelegramGate(deps?: TelegramGateDeps): ChannelHandler` where `TelegramGateDeps` shrinks to `{ getUserByTelegramId: (telegramId: string) => Promise<IUser | null> }`. `parseStartCode` is **deleted** (nothing else imports it — `tests/invites.test.ts` only uses `generateInviteCode`). `src/mastra/agents/mostro-supervisor.ts` keeps calling `createTelegramGate()` with no arguments, unchanged.

- [ ] **Step 1: Rewrite the tests for the simplified gate**

Replace the full contents of `tests/telegram-gate.test.ts` with:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { createTelegramGate, type TelegramGateDeps } from '../src/mastra/lib/telegram-gate'
import type { IUser } from '../src/business'

const member: IUser = { email: 'ana@gmail.com', telegramId: '111', name: 'Ana', role: 'member', addedAt: 1 }

function makeDeps(overrides: Partial<TelegramGateDeps> = {}): TelegramGateDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
        ...overrides,
    }
}

function makeMessage(senderId: string, text: string) {
    return { author: { userId: senderId }, text } as any
}

const thread = {} as any

describe('createTelegramGate', () => {
    it('usuario registrado pasa al defaultHandler', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        const message = makeMessage('111', 'hola')
        await createTelegramGate(deps)(thread, message, defaultHandler)
        expect(defaultHandler).toHaveBeenCalledExactlyOnceWith(thread, message)
    })

    it('desconocido es ignorado en silencio', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', 'hola'), defaultHandler)
        expect(defaultHandler).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/telegram-gate.test.ts`
Expected: FAIL — TypeScript error: `TelegramGateDeps` still requires `redeemInvite`/`linkTelegramId` (missing in `makeDeps`).

- [ ] **Step 3: Simplify the gate**

Replace the full contents of `src/mastra/lib/telegram-gate.ts` with:

```typescript
import type { ChannelHandler } from '@mastra/core/channels'
import { userRepository } from '../../business/repositories'
import type { IUser } from '../../business'

export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
}

const defaultDeps: TelegramGateDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
}

// Gate de acceso: corre antes de que el mensaje llegue al agente, así un
// desconocido no gasta tokens ni toca memoria. El canje de invitaciones vive
// en telegram-start.ts: los /start llegan como slash command, nunca como
// mensaje, así que acá no hay nada que parsear.
export function createTelegramGate(deps: TelegramGateDeps = defaultDeps): ChannelHandler {
    return async (thread, message, defaultHandler) => {
        const known = await deps.getUserByTelegramId(message.author.userId)
        if (!known) return
        await defaultHandler(thread, message)
    }
}
```

- [ ] **Step 4: Run the whole suite to verify it passes**

Run: `pnpm test`
Expected: PASS — all files, including `tests/telegram-start.test.ts` and `tests/invites.test.ts` (untouched).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/telegram-gate.ts tests/telegram-gate.test.ts
git commit -m "refactor: reduce telegram gate to known-sender check"
```

---

### Task 3: Update supervisor instructions

**Files:**
- Modify: `src/mastra/agents/mostro-supervisor.ts` (the `User management:` block inside `MOSTRO_SUPERVISOR_INSTRUCTIONS`, around lines 29-32)

**Interfaces:**
- Consumes: nothing from other tasks (prompt text only).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Replace the stale `\start <code>` rule**

In `MOSTRO_SUPERVISOR_INSTRUCTIONS`, find the `User management:` block. Replace this bullet (note the `\start` backslash typo in the current text):

```
- If a user message is exactly "\start <code>", they just joined through an invite link: welcome them warmly, briefly explain what you can do, and ask their name. When they answer, save it with setMyNameTool.
```

with:

```
- New users receive a fixed welcome message outside your pipeline that may ask for their name. If a user introduces themselves or states their name, save it with setMyNameTool.
```

Keep the admin-invite bullet and the change-name bullet unchanged.

- [ ] **Step 2: Verify nothing else references the old flow**

Run: `pnpm test`
Expected: PASS. Also run `git grep -n "start <code>" src/` — expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/mastra/agents/mostro-supervisor.ts
git commit -m "fix: replace dead /start welcome rule in supervisor instructions"
```

---

### Task 4: Register the handler and verify end-to-end

**Files:**
- Modify: `src/mastra/index.ts` (append after the `export const mastra = new Mastra({...})` block)

**Interfaces:**
- Consumes: `createTelegramStartHandler()` from Task 1 (`src/mastra/lib/telegram-start.ts`); `mostroSupervisor` (already imported in `index.ts`).
- Produces: runtime registration only.

**Background for the implementer:** `Mastra`'s constructor calls `addAgent`, which fires `AgentChannels.initialize()` **without awaiting it**, so `getChannels().sdk` can still be `null` right after `new Mastra(...)`. `initialize(mastra)` is idempotent — it returns the already-stored init promise (or returns immediately once the Chat instance exists) — so awaiting it here is the supported way to wait for `sdk` to become available. `index.ts` already uses top-level await.

- [ ] **Step 1: Add the registration**

In `src/mastra/index.ts`, add to the imports:

```typescript
import { createTelegramStartHandler } from './lib/telegram-start';
```

Append after the `export const mastra = new Mastra({...});` block:

```typescript
// El adapter de telegram desvía los /start (bot_command) al pipeline de slash
// commands del Chat SDK, así que el canje de invitaciones se registra acá y no
// en el gate de onDirectMessage. initialize() es idempotente: espera la
// inicialización que addAgent ya disparó y garantiza que sdk esté disponible.
const supervisorChannels = mostroSupervisor.getChannels();
if (supervisorChannels) {
    await supervisorChannels.initialize(mastra);
    supervisorChannels.sdk?.onSlashCommand('/start', createTelegramStartHandler());
    console.info('[telegram-start] /start handler registered');
} else {
    console.warn('[telegram-start] supervisor has no channels; /start handler not registered');
}
```

- [ ] **Step 2: Verify the dev server boots and registers the handler**

Run: `pnpm dev` (from the repo root; requires `.env` with Mongo/ngrok/Telegram config).
Expected: startup logs include `[telegram-start] /start handler registered` and no channel initialization errors. Stop the server afterwards.

If `sdk` turns out to be `null` after `await initialize(mastra)` (init failed), the warn/error will show in logs — surface that instead of proceeding.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/mastra/index.ts
git commit -m "feat: register telegram /start handler for invite redemption"
```

- [ ] **Step 5: Manual end-to-end check (with the user)**

This needs the real bot and a second Telegram account, so coordinate with the user:

1. With `pnpm dev` running, ask the admin to have the agent create an invite (or insert one directly) for a test email.
2. Open the `t.me/<bot>?start=<code>` link from an unknown Telegram account.
3. Expected: the fixed welcome message arrives; the `users` collection shows the `telegramId` linked; the invite document has `usedBy` set; a follow-up plain message reaches the agent (gate passes).
4. Reopening the bot with `/start` from the now-known account posts the "¡Hola de nuevo!" greeting.
