# Notification Thread Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subscription notifications (diapers/meds/refunds) actually reach the user's Telegram chat by storing only the canonical email and resolving the channel-bound thread at send time.

**Architecture:** Subscribers store `{ type, email }` only. A new helper `resolve-telegram-thread.ts` maps email → `telegramId` → external id `telegram:<telegramId>` → internal thread via the Mastra memory store's `listThreads` metadata filter (the same lookup Mastra uses for inbound channel messages). All six notify steps signal the supervisor with the resolved `{ resourceId: email, threadId }`.

**Tech Stack:** TypeScript ESM, Mastra (`@mastra/core`), Mongoose, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-notification-thread-resolution-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm test`, never npm).
- Commits in English, no co-author trailers, no mentions of Claude.
- Signal content/framing (the `[AVISO DEL SISTEMA — ...]` summaries) is **unchanged** — only the target `{ resourceId, threadId }` changes.
- Test runner: `pnpm test` (vitest run). Run scoped files during TDD: `pnpm test <path>`.
- Existing code style: 4-space indent and no semicolons under `src/mastra/`, 2-space indent with semicolons under `src/business/`. Match the file you touch.

---

### Task 1: Email-only subscriber model + repository

**Files:**
- Modify: `src/business/models/subscriber.model.ts`
- Modify: `src/business/repositories/subscriber.repository.ts`
- Test: `src/business/repositories/subscriber.repository.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `subscriberRepository.add(domain: 'diapers' | 'meds' | 'refunds', email: string): Promise<void>` and `subscriberRepository.list(domain): Promise<string[]>` (emails). Tasks 2 and 4 rely on these exact signatures.

- [ ] **Step 1: Rewrite the repository test for the email-only shape**

Replace the whole content of `src/business/repositories/subscriber.repository.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subscriberRepository } from './subscriber.repository';
import { Subscriber } from '../models/subscriber.model';

vi.mock('../models/subscriber.model');

describe('SubscriberRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('add upserts by type+email', async () => {
    vi.mocked(Subscriber.updateOne).mockResolvedValue({} as any);

    await subscriberRepository.add('diapers', 'ana@gmail.com');

    expect(Subscriber.updateOne).toHaveBeenCalledWith(
      { type: 'diapers', email: 'ana@gmail.com' },
      { $setOnInsert: { type: 'diapers', email: 'ana@gmail.com' } },
      { upsert: true }
    );
  });

  it('list returns emails for a domain', async () => {
    const mockDocs = [{ type: 'diapers', email: 'ana@gmail.com' }];
    vi.mocked(Subscriber.find).mockReturnValue({ lean: () => Promise.resolve(mockDocs) } as any);

    const result = await subscriberRepository.list('diapers');

    expect(result).toEqual(['ana@gmail.com']);
    expect(Subscriber.find).toHaveBeenCalledWith({ type: 'diapers' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/business/repositories/subscriber.repository.test.ts`
Expected: FAIL (add receives an object today, and list returns `{resourceId, threadId}` pairs).

- [ ] **Step 3: Update the model**

Replace the whole content of `src/business/models/subscriber.model.ts` with:

```typescript
import { Schema, model } from 'mongoose';

export interface ISubscriber {
  type: 'diapers' | 'meds' | 'refunds';
  email: string;
}

const subscriberSchema = new Schema<ISubscriber>({
  type: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true },
  email: { type: String, required: true, lowercase: true },
});

// One subscription per user per domain; the delivery thread is resolved at
// send time (see resolve-telegram-thread), so no thread data is stored here.
subscriberSchema.index({ type: 1, email: 1 }, { unique: true });

export const Subscriber = model<ISubscriber>('Subscriber', subscriberSchema);
```

- [ ] **Step 4: Update the repository**

Replace the whole content of `src/business/repositories/subscriber.repository.ts` with:

```typescript
import { Subscriber } from '../models/subscriber.model';

type Domain = 'diapers' | 'meds' | 'refunds';

export class SubscriberRepository {
  async add(domain: Domain, email: string): Promise<void> {
    // Upsert keeps the idempotency check atomic (no find-then-insert race).
    await Subscriber.updateOne(
      { type: domain, email },
      { $setOnInsert: { type: domain, email } },
      { upsert: true }
    );
  }

  async list(domain: Domain): Promise<string[]> {
    const docs = await Subscriber.find({ type: domain }).lean();
    return docs.map(({ email }) => email);
  }
}

export const subscriberRepository = new SubscriberRepository();
```

Note: `SubscriberEntry` is deleted. If `src/business/repositories/index.ts` or `src/business/index.ts` re-export it, remove that re-export. The callers still using the old signature (subscribe tools, notify steps) will fail typecheck until Tasks 2 and 4 — that is expected; do not run a full typecheck as a gate for this task.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/business/repositories/subscriber.repository.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/business/models/subscriber.model.ts src/business/repositories/subscriber.repository.ts src/business/repositories/subscriber.repository.test.ts src/business/repositories/index.ts src/business/index.ts
git commit -m "refactor: store subscribers as canonical email only"
```

---

### Task 2: Subscribe tools resolve the canonical email

**Files:**
- Modify: `src/mastra/tools/diapers-subscribe-tool.ts`
- Modify: `src/mastra/tools/meds-subscribe-tool.ts`
- Modify: `src/mastra/tools/refunds-subscribe-tool.ts`

**Interfaces:**
- Consumes: `subscriberRepository.add(domain, email)` (Task 1); `emailFromResourceId(resourceId: string): string | null` from `src/business/identity.ts` (already exists — strips the `-<subAgentKey>` suffix and validates the `@`).
- Produces: tools keep their public contract (`inputSchema {}`, `outputSchema { subscribed: boolean }`).

The tools run inside the sub-agents, so `context.agent.resourceId` is the derived id (`ana@gmail.com-diapersAgent`). `emailFromResourceId` de-derives it. The thread id is no longer stored. This also removes the uncommitted debug `console.log` in the diapers tool.

- [ ] **Step 1: Rewrite the three tools**

`src/mastra/tools/diapers-subscribe-tool.ts` (whole file):

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '../../business/repositories'
import { emailFromResourceId } from '../../business/identity'

export const subscribeDiapersTool = createTool({
    id: 'subscribe-diapers-notifications',
    description: 'Suscribe al usuario actual para recibir un aviso por Telegram cuando se confirme la fecha de entrega de pañales.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = emailFromResourceId(context?.agent?.resourceId ?? '')
        if (!email) {
            return { subscribed: false }
        }

        await subscriberRepository.add('diapers', email)
        return { subscribed: true }
    },
})
```

`src/mastra/tools/meds-subscribe-tool.ts` (whole file):

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '../../business/repositories'
import { emailFromResourceId } from '../../business/identity'

export const subscribeMedsTool = createTool({
    id: 'subscribe-meds-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram cuando la farmacia confirme la recepción del pedido y cuando se confirme la fecha de entrega.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = emailFromResourceId(context?.agent?.resourceId ?? '')
        if (!email) {
            return { subscribed: false }
        }

        await subscriberRepository.add('meds', email)
        return { subscribed: true }
    },
})
```

`src/mastra/tools/refunds-subscribe-tool.ts` (whole file):

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { subscriberRepository } from '../../business/repositories'
import { emailFromResourceId } from '../../business/identity'

export const subscribeRefundsTool = createTool({
    id: 'subscribe-refunds-notifications',
    description: 'Suscribe al usuario actual para recibir avisos por Telegram cuando el reembolso sea reconocido por el procesador de pagos, cuando se confirme y cuando el depósito llegue a la cuenta.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        subscribed: z.boolean(),
    }),
    execute: async (_input, context) => {
        const email = emailFromResourceId(context?.agent?.resourceId ?? '')
        if (!email) {
            return { subscribed: false }
        }

        await subscriberRepository.add('refunds', email)
        return { subscribed: true }
    },
})
```

- [ ] **Step 2: Run the full test suite (no regressions)**

Run: `pnpm test`
Expected: PASS. Identity tests (`identity.test.ts`) already cover `emailFromResourceId`; the tools are thin wrappers with no tests of their own, matching the existing codebase.

- [ ] **Step 3: Commit**

```bash
git add src/mastra/tools/diapers-subscribe-tool.ts src/mastra/tools/meds-subscribe-tool.ts src/mastra/tools/refunds-subscribe-tool.ts
git commit -m "fix: subscribe tools store the canonical email, not derived sub-agent ids"
```

---

### Task 3: `resolve-telegram-thread` helper

**Files:**
- Create: `src/mastra/lib/resolve-telegram-thread.ts`
- Test: `src/mastra/lib/resolve-telegram-thread.test.ts`

**Interfaces:**
- Consumes: `userRepository.findByEmail(email): Promise<IUser | null>` (exists); `IUser` has optional `telegramId?: string`.
- Produces: `resolveTelegramThread(mastra: MastraLike | undefined, email: string): Promise<{ resourceId: string; threadId: string } | null>` — the exact target shape `sendNotificationSignal` expects. Task 4 relies on this. Also exports `createResolveTelegramThread(deps)` for tests, mirroring `resolve-resource-id.ts`.

- [ ] **Step 1: Write the failing tests**

`src/mastra/lib/resolve-telegram-thread.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createResolveTelegramThread } from './resolve-telegram-thread';

const user = { email: 'ana@gmail.com', name: 'Ana', role: 'member' as const, addedAt: 1, telegramId: '555' };

function makeMastra(threads: Array<{ id: string }>) {
    const listThreads = vi.fn().mockResolvedValue({ threads });
    const mastra = {
        getStorage: () => ({ getStore: async () => ({ listThreads }) }),
    };
    return { mastra: mastra as any, listThreads };
}

describe('createResolveTelegramThread', () => {
    it('resolves the email to the telegram-bound thread', async () => {
        const { mastra, listThreads } = makeMastra([{ id: 'thread-1' }]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(user),
        });

        await expect(resolve(mastra, 'ana@gmail.com')).resolves.toEqual({
            resourceId: 'ana@gmail.com',
            threadId: 'thread-1',
        });
        expect(listThreads).toHaveBeenCalledWith({
            filter: { metadata: { channel_externalThreadId: 'telegram:555' } },
            perPage: 1,
        });
    });

    it('returns null when no user matches the email', async () => {
        const { mastra } = makeMastra([{ id: 'thread-1' }]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(null),
        });

        await expect(resolve(mastra, 'nadie@gmail.com')).resolves.toBeNull();
    });

    it('returns null when the user has no telegramId', async () => {
        const { mastra } = makeMastra([{ id: 'thread-1' }]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue({ ...user, telegramId: undefined }),
        });

        await expect(resolve(mastra, 'ana@gmail.com')).resolves.toBeNull();
    });

    it('returns null when no thread matches the external id', async () => {
        const { mastra } = makeMastra([]);
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(user),
        });

        await expect(resolve(mastra, 'ana@gmail.com')).resolves.toBeNull();
    });

    it('returns null when storage is unavailable', async () => {
        const resolve = createResolveTelegramThread({
            getUserByEmail: vi.fn().mockResolvedValue(user),
        });

        await expect(resolve(undefined, 'ana@gmail.com')).resolves.toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/mastra/lib/resolve-telegram-thread.test.ts`
Expected: FAIL with "Cannot find module './resolve-telegram-thread'" (or equivalent).

- [ ] **Step 3: Implement the helper**

`src/mastra/lib/resolve-telegram-thread.ts`:

```typescript
import { userRepository } from '../../business/repositories'
import type { IUser } from '../../business'

// Tipos estructurales mínimos sobre el storage de Mastra para que los tests
// puedan stubear sin arrastrar la instancia completa.
export type MemoryStoreLike = {
    listThreads: (args: {
        filter: { metadata: Record<string, string> }
        perPage: number
    }) => Promise<{ threads: Array<{ id: string }> }>
}
export type StorageLike = {
    getStore: (name: 'memory') => Promise<MemoryStoreLike | undefined>
}
export type MastraLike = {
    getStorage: () => StorageLike | undefined
}

export type ResolveTelegramThreadDeps = {
    getUserByEmail: (email: string) => Promise<IUser | null>
}

const defaultDeps: ResolveTelegramThreadDeps = {
    getUserByEmail: email => userRepository.findByEmail(email),
}

// Los suscriptores guardan solo el email canónico; el thread de entrega se
// resuelve acá al momento del envío. Un DM de Telegram tiene id externo
// determinístico `telegram:<telegramId>` y Mastra lo persiste en la metadata
// del thread interno (channel_externalThreadId) — el mismo lookup que hace el
// framework para los mensajes entrantes. Null = no hay dónde entregar (el
// usuario nunca habló con el bot): el caller loguea y saltea.
export function createResolveTelegramThread(deps: ResolveTelegramThreadDeps = defaultDeps) {
    return async (
        mastra: MastraLike | undefined,
        email: string,
    ): Promise<{ resourceId: string; threadId: string } | null> => {
        const user = await deps.getUserByEmail(email)
        if (!user?.telegramId) return null

        const memoryStore = await mastra?.getStorage()?.getStore('memory')
        if (!memoryStore) return null

        const { threads } = await memoryStore.listThreads({
            filter: { metadata: { channel_externalThreadId: `telegram:${user.telegramId}` } },
            perPage: 1,
        })
        const thread = threads[0]
        if (!thread) return null

        return { resourceId: email, threadId: thread.id }
    }
}

export const resolveTelegramThread = createResolveTelegramThread()
```

If `IUser` is not re-exported from `src/business/index.ts`, import it from `'../../business/models/user.model'` instead (check how `resolve-resource-id.ts` imports it and match).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/mastra/lib/resolve-telegram-thread.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/resolve-telegram-thread.ts src/mastra/lib/resolve-telegram-thread.test.ts
git commit -m "feat: resolve a user's telegram-bound thread from their canonical email"
```

---

### Task 4: Notify steps signal the resolved channel thread

**Files:**
- Modify: `src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts`
- Modify: `src/mastra/workflows/meds/steps/notify-meds-ack.step.ts`
- Modify: `src/mastra/workflows/meds/steps/notify-meds-confirmation.step.ts`
- Modify: `src/mastra/workflows/refunds/steps/notify-refund-ack.step.ts`
- Modify: `src/mastra/workflows/refunds/steps/notify-refund-confirmation.step.ts`
- Modify: `src/mastra/workflows/refunds/steps/notify-deposit.step.ts`

**Interfaces:**
- Consumes: `subscriberRepository.list(domain): Promise<string[]>` (Task 1); `resolveTelegramThread(mastra, email)` (Task 3).
- Produces: same step outputs as today; `notifiedCount` now counts only actually-sent signals.

Each step changes the same way: iterate emails, resolve the target, warn+skip on `null`, count sent. **Do not touch the `summary`/`payload` content.** The import path from any `steps/` dir is `'../../../lib/resolve-telegram-thread'`.

- [ ] **Step 1: Rewrite `notify-diapers-confirmation.step.ts`**

Whole file:

```typescript
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { subscriberRepository } from '../../../../business/repositories'
import { resolveTelegramThread } from '../../../lib/resolve-telegram-thread'
import { formatUnixDate, nowUnix } from '../../../lib/unix-time'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { notifyUsersOutputSchema } from '../schemas/notify-users-output.schema'

export const notifyDiapersConfirmation = createStep({
    id: 'notify-users',
    inputSchema: z.object({}),
    outputSchema: notifyUsersOutputSchema,
    stateSchema: diapersStateSchema,
    execute: async ({ state, setState, mastra }) => {
        const emails = await subscriberRepository.list('diapers')

        const supervisor = mastra?.getAgent('mostroSupervisor')
        let sent = 0
        if (supervisor) {
            for (const email of emails) {
                const target = await resolveTelegramThread(mastra, email)
                if (!target) {
                    console.warn(`[notify-users] no telegram thread for ${email}, skipping`)
                    continue
                }
                await supervisor.sendNotificationSignal(
                    {
                        source: 'diapers',
                        kind: 'diapers-confirmation',
                        priority: 'high',
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: los pañales (${state.diaperType ?? 'sin especificar'}) llegan el ${state.deliveryDate != null ? formatUnixDate(state.deliveryDate) : 'fecha a confirmar'}.`,
                        payload: {
                            diaperType: state.diaperType,
                            quantity: state.quantity,
                            deliveryDate: state.deliveryDate,
                            deliveryAddress: state.deliveryAddress,
                        },
                    },
                    target,
                )
                sent++
            }
        }

        await setState({
            ...state,
            status: 'diapers_notification_sent',
            notifiedAt: nowUnix(),
            notifiedCount: sent,
        })

        return { notifiedCount: sent }
    },
})
```

- [ ] **Step 2: Apply the identical transformation to the other five steps**

For each of `notify-meds-ack.step.ts`, `notify-meds-confirmation.step.ts`, `notify-refund-ack.step.ts`, `notify-refund-confirmation.step.ts`, `notify-deposit.step.ts`:

1. Add `import { resolveTelegramThread } from '../../../lib/resolve-telegram-thread'`.
2. `const subscribers = await subscriberRepository.list('<domain>')` → `const emails = await subscriberRepository.list('<domain>')`.
3. Add `let sent = 0` before the `if (supervisor)` block.
4. `for (const { resourceId, threadId } of subscribers)` → `for (const email of emails)`, and inside the loop, before `sendNotificationSignal`:

```typescript
const target = await resolveTelegramThread(mastra, email)
if (!target) {
    console.warn(`[<step-id>] no telegram thread for ${email}, skipping`)
    continue
}
```

(use each step's real id in the warn prefix: `notify-meds-ack`, `notify-meds-confirmation`, `notify-refund-ack`, `notify-refund-confirmation`, `notify-deposit`).

5. Replace the second argument `{ resourceId, threadId }` with `target`, and add `sent++` after the `await supervisor.sendNotificationSignal(...)` call.
6. Where the step records counts (`notify-meds-confirmation`, `notify-deposit`): `notifiedCount: subscribers.length` → `notifiedCount: sent` (both in `setState` and in the returned object). The ack/confirmation steps without `notifiedCount` need no count changes beyond the `sent++` bookkeeping.

The signal object (source/kind/priority/summary/payload) stays byte-for-byte identical in every step.

- [ ] **Step 3: Typecheck and run the full suite**

Run: `pnpm exec tsc --noEmit` — Expected: no errors (this also proves no caller of the old repository API remains).
Run: `pnpm test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/mastra/workflows
git commit -m "fix: notify steps resolve the telegram-bound thread instead of stored derived ids"
```

---

### Task 5: Data cleanup (old subscribers + stale index)

**Files:** none (database-only). The old documents store derived sub-agent ids and are undeliverable; users re-subscribe via chat.

- [ ] **Step 1: Delete old subscriber docs and drop the stale index**

Preferred (controller session with MongoDB MCP): on database `mostro`, collection `subscribers`, run `delete-many` with filter `{}`, then `drop-index` for `type_1_resourceId_1_threadId_1`.

CLI alternative:

```bash
URI=$(grep '^MONGODB_URI=' .env | cut -d= -f2-)
mongosh "$URI" --eval 'db = db.getSiblingDB("mostro"); print(db.subscribers.deleteMany({})); try { db.subscribers.dropIndex("type_1_resourceId_1_threadId_1") } catch (e) { print(e.message) }'
```

Expected: deletedCount ≥ 1, index dropped (or "index not found" if the collection was recreated). Mongoose autoIndex creates the new `{ type: 1, email: 1 }` unique index on next boot.

- [ ] **Step 2: Verify**

Query `subscribers`: `db.subscribers.find({})` → empty; `db.subscribers.getIndexes()` → no `type_1_resourceId_1_threadId_1`.

---

### Task 6: Manual end-to-end verification

No files. Requires the dev server (`pnpm dev`) and Telegram access — this is a user-assisted check.

- [ ] **Step 1: Re-subscribe via Telegram**

In the Telegram chat, ask to subscribe to diapers notifications. Verify in Mongo that `subscribers` now holds `{ type: 'diapers', email: 'averstraeten@gmail.com' }` (no `threadId`).

- [ ] **Step 2: Trigger the notification**

Run the diapers workflow to the confirmation step (same procedure used today, e.g. from Studio). Expected: the notice ("los pañales ... llegan el ...") arrives **in the Telegram chat**, and the signal + relay message land in the thread whose `resourceId` is the bare email (`d23ee7b3-…` style thread with `channel_externalThreadId` metadata), not in a `-diapersAgent` derived thread.

- [ ] **Step 3: Confirm `notifiedCount`**

The workflow step output reports `notifiedCount: 1` (only actually-sent signals).
