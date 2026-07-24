# Request Author Required — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the Telegram display name when an invite is redeemed, and make `requestedBy` mandatory across the diapers, meds and refunds order flows so no order can be placed without an identified author.

**Architecture:** The `/start` redeem handler already receives the sender's `Author.fullName` from the Chat SDK; we thread it into user provisioning. Each request tool resolves the caller and rejects (structured error) when there is no usable name, otherwise passes it as `requestedBy`. Workflow input and state schemas require `requestedBy` (`z.string().min(1)`); because Mastra validates the initial state against the state schema on `run.start`, each start passes `initialState: { requestedBy }`. Meds is restructured to start directly with medications + author (dropping the vestigial `wait-prescriptions` suspend/resume) so all three flows are uniform.

**Tech Stack:** TypeScript (ES2022), Mastra workflows/tools/agents, Zod v4, Mongoose, Vitest.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Run a single test file with: `pnpm exec vitest run <path>`.
- Run the full suite with: `pnpm test` (which is `vitest run`).
- Typecheck with `pnpm exec tsc --noEmit` (do NOT use `mastra build` / `pnpm build` — it fails with an EBUSY lock on `mastra.duckdb` while dev is running).
- Mongo is a disposable sandbox that will be wiped — there are no historical workflow runs to keep readable.
- `requestedBy` mandatory value shape: `z.string().min(1)`.
- Tool rejection shape (interpretable by the LLM agents): `{ ok: false, reason: 'requester_unidentified', message: '<spanish text>' }`.
- Commit messages: English, no co-authorship/Claude mentions.

---

### Task 1: Capture the Telegram name at invite redeem

**Files:**
- Modify: `src/business/repositories/user.repository.ts:34-51` (`upsertFromInviteRedeem`)
- Modify: `src/business/repositories/user.repository.test.ts`
- Modify: `src/mastra/lib/telegram-start.ts` (type `TelegramStartDeps`, `TelegramStartEvent`, `defaultDeps`, handler call at line 62)
- Modify: `src/mastra/lib/telegram-start.test.ts`
- Modify: `tests/telegram-start.test.ts`

**Interfaces:**
- Produces: `userRepository.upsertFromInviteRedeem(email: string, telegramId: string, name: string): Promise<IUser>` — now takes `name`, written into `$setOnInsert`.
- Produces: `TelegramStartDeps.provisionUser(email: string, telegramId: string, name: string): Promise<IUser>`.
- Produces: `TelegramStartEvent.user` is `{ userId: string; fullName: string }`.

- [ ] **Step 1: Update the repository tests to pass and assert a name**

In `src/business/repositories/user.repository.test.ts`, replace the two `upsertFromInviteRedeem` tests (lines 38-74) with:

```ts
  it('upsertFromInviteRedeem creates the user with the given name and telegram linked', async () => {
    const mockUser = { email: 'new@gmail.com', name: 'Ana', role: 'member' as const, telegramId: '42', addedAt: 123 };
    vi.mocked(User.findOneAndUpdate).mockResolvedValue(mockUser as any);

    const result = await userRepository.upsertFromInviteRedeem('New@Gmail.com', '42', 'Ana');

    expect(result).toEqual(mockUser);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'new@gmail.com' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ email: 'new@gmail.com', name: 'Ana', role: 'member' }),
        $set: { telegramId: '42' },
      }),
      { upsert: true, new: true }
    );
  });

  it('upsertFromInviteRedeem does not clobber an existing user (setOnInsert only)', async () => {
    const existingUser = { email: 'ana@gmail.com', name: 'Ana', role: 'admin' as const, telegramId: '99', addedAt: 5 };
    vi.mocked(User.findOneAndUpdate).mockResolvedValue(existingUser as any);

    const result = await userRepository.upsertFromInviteRedeem('Ana@Gmail.com', '99', 'Telegram Name');

    expect(result).toEqual(existingUser);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'ana@gmail.com' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ email: 'ana@gmail.com', name: 'Telegram Name', role: 'member' }),
        $set: { telegramId: '99' },
      }),
      { upsert: true, new: true }
    );
  });
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `pnpm exec vitest run src/business/repositories/user.repository.test.ts`
Expected: FAIL — `upsertFromInviteRedeem` still ignores the third arg and writes `name: ''`.

- [ ] **Step 3: Implement the name parameter in the repository**

In `src/business/repositories/user.repository.ts`, change `upsertFromInviteRedeem`:

```ts
  async upsertFromInviteRedeem(email: string, telegramId: string, name: string): Promise<IUser> {
    const normalized = email.toLowerCase();
    const result = await User.findOneAndUpdate(
      { email: normalized },
      {
        $setOnInsert: {
          email: normalized,
          name,
          role: 'member' as const,
          addedAt: nowUnix(),
        },
        $set: { telegramId },
      },
      { upsert: true, new: true }
    );
    if (!result) throw new Error('Failed to upsert user from invite redeem');
    return result;
  }
```

- [ ] **Step 4: Run the repository test to verify it passes**

Run: `pnpm exec vitest run src/business/repositories/user.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Update both telegram-start test files**

In `src/mastra/lib/telegram-start.test.ts`, change `makeEvent` (line 31-33) to carry a name and update the provision assertion:

```ts
function makeEvent(text: string, fullName = 'Vani Telegram') {
  return { user: { userId: '42', fullName }, text, channel: { post: vi.fn().mockResolvedValue(undefined) } };
}
```

Update the "provisions the user on a valid redeem" test (lines 58-66) so the provision assertion includes the name:

```ts
    expect(deps.provisionUser).toHaveBeenCalledWith('new@gmail.com', '42', 'Vani Telegram');
```

Add two tests inside the same `describe`:

```ts
  it('passes the trimmed Telegram fullName as the provisioned name', async () => {
    const deps = makeDeps();
    const event = makeEvent('abc123', '  Ana Perez  ');

    await createTelegramStartHandler(deps)(event);

    expect(deps.provisionUser).toHaveBeenCalledWith('new@gmail.com', '42', 'Ana Perez');
  });

  it('provisions with empty name when fullName is blank', async () => {
    const deps = makeDeps();
    const event = makeEvent('abc123', '   ');

    await createTelegramStartHandler(deps)(event);

    expect(deps.provisionUser).toHaveBeenCalledWith('new@gmail.com', '42', '');
  });
```

In `tests/telegram-start.test.ts`, change `makeEvent` (lines 24-27) and the provision assertion (line 55):

```ts
function makeEvent(senderId: string, text: string, fullName = 'Nueva Persona') {
    const post = vi.fn(async () => ({}))
    return { event: { user: { userId: senderId, fullName }, text, channel: { post } }, post }
}
```

```ts
        expect(deps.provisionUser).toHaveBeenCalledWith('nueva@gmail.com', '222', 'Nueva Persona')
```

- [ ] **Step 6: Run both telegram-start test files to verify they fail**

Run: `pnpm exec vitest run src/mastra/lib/telegram-start.test.ts tests/telegram-start.test.ts`
Expected: FAIL — handler still calls `provisionUser` with two args and the type lacks `fullName`.

- [ ] **Step 7: Implement fullName capture in the handler**

In `src/mastra/lib/telegram-start.ts`:

Change the `TelegramStartDeps.provisionUser` type (line 7):

```ts
    provisionUser: (email: string, telegramId: string, name: string) => Promise<IUser>
```

Change `defaultDeps.provisionUser` (line 13):

```ts
    provisionUser: (email, telegramId, name) => userRepository.upsertFromInviteRedeem(email, telegramId, name),
```

Change the `TelegramStartEvent` user type (line 19):

```ts
export type TelegramStartEvent = {
    user: { userId: string; fullName: string }
    text: string
    channel: { post: (message: string) => Promise<unknown> }
}
```

Change the provision call in the handler (line 62):

```ts
                const user = await deps.provisionUser(invite.email, telegramId, event.user.fullName.trim())
```

- [ ] **Step 8: Run both telegram-start test files to verify they pass**

Run: `pnpm exec vitest run src/mastra/lib/telegram-start.test.ts tests/telegram-start.test.ts`
Expected: PASS

- [ ] **Step 9: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/business/repositories/user.repository.ts src/business/repositories/user.repository.test.ts src/mastra/lib/telegram-start.ts src/mastra/lib/telegram-start.test.ts tests/telegram-start.test.ts
git commit -m "feat: capture telegram display name when redeeming an invite"
```

---

### Task 2: Diapers — mandatory requestedBy

**Files:**
- Modify: `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts`
- Modify: `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts`
- Modify: `src/mastra/workflows/diapers/schemas/diapers-state.schema.ts:13`
- Modify: `src/mastra/lib/diapers-run.ts:22-43` (`startDiapers`)
- Modify: `src/mastra/tools/diapers-request-tool.ts`
- Create: `src/mastra/tools/diapers-request-tool.test.ts`

**Interfaces:**
- Produces: `startDiapers(mastra, { size: 'M'|'G'|'XG'; yearMonth?: string; requestedBy: string })` — `requestedBy` no longer optional; starts with `initialState: { requestedBy }`.
- Produces: `requestDiapersTool` returns `{ ok: false, reason: 'requester_unidentified', message: string }` when the caller has no usable name.

- [ ] **Step 1: Update the input schema test**

Replace `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { requestDiapersInputSchema } from './request-diapers-input.schema'

describe('requestDiapersInputSchema', () => {
    it.each(['M', 'G', 'XG'])('acepta el talle %s con requestedBy', (size) => {
        const result = requestDiapersInputSchema.safeParse({ size, requestedBy: 'Ana' })
        expect(result.success).toBe(true)
    })

    it('rechaza un talle fuera del enum', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'L', requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })

    it('rechaza una solicitud sin talle', () => {
        const result = requestDiapersInputSchema.safeParse({ requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })

    it('rechaza una solicitud sin requestedBy', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'M' })
        expect(result.success).toBe(false)
    })

    it('rechaza requestedBy vacío', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'M', requestedBy: '' })
        expect(result.success).toBe(false)
    })
})
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `pnpm exec vitest run src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts`
Expected: FAIL — "rechaza una solicitud sin requestedBy" and "rechaza requestedBy vacío" fail (still optional).

- [ ] **Step 3: Make the input and state schemas require requestedBy**

`src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts`:

```ts
import { z } from 'zod'

export const requestDiapersInputSchema = z.object({
    size: z.enum(['M', 'G', 'XG']),
    requestedBy: z.string().min(1),
})
```

`src/mastra/workflows/diapers/schemas/diapers-state.schema.ts` line 13, change:

```ts
    requestedBy: z.string().min(1),
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm exec vitest run src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts`
Expected: PASS

- [ ] **Step 5: Write the request-tool test**

Create `src/mastra/tools/diapers-request-tool.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../business/identity', () => ({
  getUserByResourceId: vi.fn(),
}))
vi.mock('../lib/diapers-run', () => ({
  startDiapers: vi.fn(),
}))

import { requestDiapersTool } from './diapers-request-tool'
import { getUserByResourceId } from '../../business/identity'
import { startDiapers } from '../lib/diapers-run'

const ctx = { mastra: {}, agent: { resourceId: 'ana@gmail.com' } }
function run(input: any, context: any = ctx) {
  return (requestDiapersTool.execute as any)(input, context)
}

describe('requestDiapersTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(startDiapers).mockResolvedValue({ alreadyInProgress: false, result: {} } as any)
  })

  it('rejects with requester_unidentified when the user has an empty name', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: '', role: 'member', addedAt: 1 } as any)
    const result = await run({ size: 'M' })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startDiapers).not.toHaveBeenCalled()
  })

  it('rejects with requester_unidentified when the user cannot be resolved', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue(null)
    const result = await run({ size: 'M' })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startDiapers).not.toHaveBeenCalled()
  })

  it('starts the order with the resolved name as requestedBy', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: 'Ana', role: 'member', addedAt: 1 } as any)
    await run({ size: 'M' })
    expect(startDiapers).toHaveBeenCalledWith({}, { size: 'M', requestedBy: 'Ana' })
  })
})
```

- [ ] **Step 6: Run the request-tool test to verify it fails**

Run: `pnpm exec vitest run src/mastra/tools/diapers-request-tool.test.ts`
Expected: FAIL — the tool currently starts the order even with an empty name.

- [ ] **Step 7: Add the guard to the tool and update startDiapers**

`src/mastra/tools/diapers-request-tool.ts`, replace `execute`:

```ts
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        if (!user?.name?.trim()) {
            return {
                ok: false,
                reason: 'requester_unidentified',
                message: 'Todavía no sé tu nombre, así que no registré el pedido. ¿Cómo te llamás?',
            }
        }
        return startDiapers(context.mastra as any, { ...input, requestedBy: user.name.trim() })
    },
```

`src/mastra/lib/diapers-run.ts`, change `startDiapers` signature (line 24) and the `run.start` call (line 40):

```ts
    input: { size: 'M' | 'G' | 'XG'; yearMonth?: string; requestedBy: string },
```

```ts
    const result = await run.start({
        inputData: { size: input.size, requestedBy: input.requestedBy },
        initialState: { requestedBy: input.requestedBy },
    })
```

- [ ] **Step 8: Run the request-tool test to verify it passes**

Run: `pnpm exec vitest run src/mastra/tools/diapers-request-tool.test.ts`
Expected: PASS

- [ ] **Step 9: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts src/mastra/workflows/diapers/schemas/diapers-state.schema.ts src/mastra/lib/diapers-run.ts src/mastra/tools/diapers-request-tool.ts src/mastra/tools/diapers-request-tool.test.ts
git commit -m "feat: require an identified author to place a diaper order"
```

---

### Task 3: Refunds — mandatory requestedBy

**Files:**
- Modify: `src/mastra/workflows/refunds/schemas/request-refund-input.schema.ts`
- Create: `src/mastra/workflows/refunds/schemas/request-refund-input.schema.test.ts`
- Modify: `src/mastra/workflows/refunds/schemas/refunds-state.schema.ts:18`
- Modify: `src/mastra/lib/refunds-run.ts:22-45` (`startRefundRequest`)
- Modify: `src/mastra/tools/refunds-request-tool.ts`
- Create: `src/mastra/tools/refunds-request-tool.test.ts`

**Interfaces:**
- Produces: `startRefundRequest(mastra, { amount: number; reason?: string; yearMonth?: string; requestedBy: string })` — `requestedBy` required; starts with `initialState: { requestedBy }`.
- Produces: `requestRefundTool` returns `{ ok: false, reason: 'requester_unidentified', message: string }` when the caller has no usable name.

- [ ] **Step 1: Write the input schema test**

Create `src/mastra/workflows/refunds/schemas/request-refund-input.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { requestRefundInputSchema } from './request-refund-input.schema'

describe('requestRefundInputSchema', () => {
    it('acepta monto con requestedBy', () => {
        const result = requestRefundInputSchema.safeParse({ amount: 100, requestedBy: 'Ana' })
        expect(result.success).toBe(true)
    })

    it('rechaza sin requestedBy', () => {
        const result = requestRefundInputSchema.safeParse({ amount: 100 })
        expect(result.success).toBe(false)
    })

    it('rechaza requestedBy vacío', () => {
        const result = requestRefundInputSchema.safeParse({ amount: 100, requestedBy: '' })
        expect(result.success).toBe(false)
    })
})
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `pnpm exec vitest run src/mastra/workflows/refunds/schemas/request-refund-input.schema.test.ts`
Expected: FAIL — the two rejection cases pass validation (still optional).

- [ ] **Step 3: Make the input and state schemas require requestedBy**

`src/mastra/workflows/refunds/schemas/request-refund-input.schema.ts`:

```ts
import { z } from 'zod'

export const requestRefundInputSchema = z.object({
    amount: z.number(),
    reason: z.string().optional(),
    requestedBy: z.string().min(1),
})
```

`src/mastra/workflows/refunds/schemas/refunds-state.schema.ts` line 18, change:

```ts
    requestedBy: z.string().min(1),
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm exec vitest run src/mastra/workflows/refunds/schemas/request-refund-input.schema.test.ts`
Expected: PASS

- [ ] **Step 5: Write the request-tool test**

Create `src/mastra/tools/refunds-request-tool.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../business/identity', () => ({
  getUserByResourceId: vi.fn(),
}))
vi.mock('../lib/refunds-run', () => ({
  startRefundRequest: vi.fn(),
}))

import { requestRefundTool } from './refunds-request-tool'
import { getUserByResourceId } from '../../business/identity'
import { startRefundRequest } from '../lib/refunds-run'

const ctx = { mastra: {}, agent: { resourceId: 'ana@gmail.com' } }
function run(input: any, context: any = ctx) {
  return (requestRefundTool.execute as any)(input, context)
}

describe('requestRefundTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(startRefundRequest).mockResolvedValue({ alreadyInProgress: false, result: {} } as any)
  })

  it('rejects with requester_unidentified when the user has an empty name', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: '', role: 'member', addedAt: 1 } as any)
    const result = await run({ amount: 100 })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startRefundRequest).not.toHaveBeenCalled()
  })

  it('rejects with requester_unidentified when the user cannot be resolved', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue(null)
    const result = await run({ amount: 100 })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startRefundRequest).not.toHaveBeenCalled()
  })

  it('starts the refund with the resolved name as requestedBy', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: 'Ana', role: 'member', addedAt: 1 } as any)
    await run({ amount: 100, reason: 'demora' })
    expect(startRefundRequest).toHaveBeenCalledWith({}, { amount: 100, reason: 'demora', requestedBy: 'Ana' })
  })
})
```

- [ ] **Step 6: Run the request-tool test to verify it fails**

Run: `pnpm exec vitest run src/mastra/tools/refunds-request-tool.test.ts`
Expected: FAIL — the tool currently starts the refund even with an empty name.

- [ ] **Step 7: Add the guard to the tool and update startRefundRequest**

`src/mastra/tools/refunds-request-tool.ts`, replace `execute`:

```ts
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        if (!user?.name?.trim()) {
            return {
                ok: false,
                reason: 'requester_unidentified',
                message: 'Todavía no sé tu nombre, así que no registré el pedido. ¿Cómo te llamás?',
            }
        }
        return startRefundRequest(context.mastra as any, { ...input, requestedBy: user.name.trim() })
    },
```

`src/mastra/lib/refunds-run.ts`, change `startRefundRequest` signature (line 24) and the `run.start` call (lines 40-42):

```ts
    input: { amount: number; reason?: string; yearMonth?: string; requestedBy: string },
```

```ts
    const result = await run.start({
        inputData: { amount: input.amount, reason: input.reason, requestedBy: input.requestedBy },
        initialState: { requestedBy: input.requestedBy },
    })
```

- [ ] **Step 8: Run the request-tool test to verify it passes**

Run: `pnpm exec vitest run src/mastra/tools/refunds-request-tool.test.ts`
Expected: PASS

- [ ] **Step 9: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/mastra/workflows/refunds/schemas/request-refund-input.schema.ts src/mastra/workflows/refunds/schemas/request-refund-input.schema.test.ts src/mastra/workflows/refunds/schemas/refunds-state.schema.ts src/mastra/lib/refunds-run.ts src/mastra/tools/refunds-request-tool.ts src/mastra/tools/refunds-request-tool.test.ts
git commit -m "feat: require an identified author to request a refund"
```

---

### Task 4: Meds — restructure and mandatory requestedBy

**Files:**
- Modify: `src/mastra/workflows/meds/schemas/meds-workflow-input.schema.ts`
- Create: `src/mastra/workflows/meds/schemas/meds-workflow-input.schema.test.ts`
- Modify: `src/mastra/workflows/meds/steps/request-meds.step.ts`
- Modify: `src/mastra/workflows/meds/meds.workflow.ts`
- Modify: `src/mastra/workflows/meds/schemas/meds-state.schema.ts`
- Modify: `src/mastra/lib/meds-run.ts:22-44` (`startMedsOrder`)
- Modify: `src/mastra/tools/meds-request-tool.ts`
- Create: `src/mastra/tools/meds-request-tool.test.ts`
- Delete: `src/mastra/workflows/meds/steps/wait-prescriptions.step.ts`
- Delete: `src/mastra/workflows/meds/schemas/wait-prescriptions-resume.schema.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `medsWorkflowInputSchema = z.object({ medications: z.array(z.string()), requestedBy: z.string().min(1) })`.
- Produces: `requestMedsStep` is the first step; `inputSchema` is `medsWorkflowInputSchema`; sets state `{ medications, requestedBy, status: 'meds_requested', requestedAt }`.
- Produces: `startMedsOrder(mastra, { medications: string[]; yearMonth?: string; requestedBy: string })` — single `run.start`, no resume, with `initialState: { requestedBy }`.
- Produces: `requestMedsTool` returns `{ ok: false, reason: 'requester_unidentified', message: string }` when the caller has no usable name.

- [ ] **Step 1: Write the workflow input schema test**

Create `src/mastra/workflows/meds/schemas/meds-workflow-input.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { medsWorkflowInputSchema } from './meds-workflow-input.schema'

describe('medsWorkflowInputSchema', () => {
    it('acepta medicamentos con requestedBy', () => {
        const result = medsWorkflowInputSchema.safeParse({ medications: ['ibuprofeno'], requestedBy: 'Ana' })
        expect(result.success).toBe(true)
    })

    it('rechaza sin requestedBy', () => {
        const result = medsWorkflowInputSchema.safeParse({ medications: ['ibuprofeno'] })
        expect(result.success).toBe(false)
    })

    it('rechaza requestedBy vacío', () => {
        const result = medsWorkflowInputSchema.safeParse({ medications: ['ibuprofeno'], requestedBy: '' })
        expect(result.success).toBe(false)
    })
})
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `pnpm exec vitest run src/mastra/workflows/meds/schemas/meds-workflow-input.schema.test.ts`
Expected: FAIL — schema is currently `z.object({})`, so the rejection cases pass.

- [ ] **Step 3: Rewrite the meds workflow input schema**

`src/mastra/workflows/meds/schemas/meds-workflow-input.schema.ts`:

```ts
import { z } from 'zod'

export const medsWorkflowInputSchema = z.object({
    medications: z.array(z.string()),
    requestedBy: z.string().min(1),
})
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `pnpm exec vitest run src/mastra/workflows/meds/schemas/meds-workflow-input.schema.test.ts`
Expected: PASS

- [ ] **Step 5: Make request-meds the first step (absorb prescriptions)**

Replace `src/mastra/workflows/meds/steps/request-meds.step.ts`:

```ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { medsWorkflowInputSchema } from '../schemas/meds-workflow-input.schema'

export const requestMedsStep = createStep({
    id: 'request-meds',
    inputSchema: medsWorkflowInputSchema,
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    execute: async ({ inputData, state, setState }) => {
        await setState({
            ...state,
            status: 'meds_requested',
            medications: inputData.medications,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        const messagingUrl = appConfig.MEDS_MESSAGING_URL
        if (messagingUrl) {
            await fetch(messagingUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    medications: inputData.medications,
                }),
            })
        } else {
            console.log('[meds-workflow] MEDS_MESSAGING_URL not set, skipping messaging call')
        }

        return {}
    },
})
```

- [ ] **Step 6: Drop wait-prescriptions from the workflow chain**

Replace `src/mastra/workflows/meds/meds.workflow.ts`:

```ts
import { createWorkflow } from '@mastra/core/workflows'
import { medsStateSchema } from './schemas/meds-state.schema'
import { medsWorkflowInputSchema } from './schemas/meds-workflow-input.schema'
import { notifyMedsConfirmationOutputSchema } from './schemas/notify-meds-confirmation-output.schema'
import { requestMedsStep } from './steps/request-meds.step'
import { waitMedsAcknowledgeStep } from './steps/wait-meds-acknowledge.step'
import { notifyMedsAckStep } from './steps/notify-meds-ack.step'
import { waitMedsConfirmationStep } from './steps/wait-meds-confirmation.step'
import { notifyMedsConfirmationStep } from './steps/notify-meds-confirmation.step'

export const medsWorkflow = createWorkflow({
    id: 'meds-workflow',
    inputSchema: medsWorkflowInputSchema,
    outputSchema: notifyMedsConfirmationOutputSchema,
    stateSchema: medsStateSchema,
})
    .then(requestMedsStep)
    .then(waitMedsAcknowledgeStep)
    .then(notifyMedsAckStep)
    .then(waitMedsConfirmationStep)
    .then(notifyMedsConfirmationStep)
    .commit()
```

- [ ] **Step 7: Update the meds state schema (drop intermediate status, require requestedBy)**

Replace `src/mastra/workflows/meds/schemas/meds-state.schema.ts`:

```ts
import { z } from 'zod'
import { unixTimestampSchema } from '../../../lib/unix-time'

export const medsStateSchema = z.object({
    status: z.enum([
        'idle',
        'meds_requested',
        'meds_acknowledged',
        'ack_notified',
        'delivery_confirmed',
        'meds_notification_sent',
    ]).default('idle'),
    medications: z.array(z.string()).optional(),
    requestedBy: z.string().min(1),
    requestedAt: unixTimestampSchema.optional(),
    acknowledgedAt: unixTimestampSchema.optional(),
    ackNotifiedAt: unixTimestampSchema.optional(),
    deliveryDate: unixTimestampSchema.optional(),
    deliveryAddress: z.string().optional(),
    notifiedAt: unixTimestampSchema.optional(),
    notifiedCount: z.number().optional(),
})
```

- [ ] **Step 8: Update startMedsOrder to start directly**

`src/mastra/lib/meds-run.ts`, change `startMedsOrder` signature (line 24) and the start/resume block (lines 39-41):

```ts
    input: { medications: string[]; yearMonth?: string; requestedBy: string },
```

```ts
    const run = await workflow.createRun({ runId })
    const result = await run.start({
        inputData: { medications: input.medications, requestedBy: input.requestedBy },
        initialState: { requestedBy: input.requestedBy },
    })
```

(Remove the previous two-line `await run.start({ inputData: {} })` + `run.resume(...)`.)

- [ ] **Step 9: Delete the vestigial step and schema**

```bash
git rm src/mastra/workflows/meds/steps/wait-prescriptions.step.ts src/mastra/workflows/meds/schemas/wait-prescriptions-resume.schema.ts
```

- [ ] **Step 10: Write the request-tool test**

Create `src/mastra/tools/meds-request-tool.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../business/identity', () => ({
  getUserByResourceId: vi.fn(),
}))
vi.mock('../lib/meds-run', () => ({
  startMedsOrder: vi.fn(),
}))

import { requestMedsTool } from './meds-request-tool'
import { getUserByResourceId } from '../../business/identity'
import { startMedsOrder } from '../lib/meds-run'

const ctx = { mastra: {}, agent: { resourceId: 'ana@gmail.com' } }
function run(input: any, context: any = ctx) {
  return (requestMedsTool.execute as any)(input, context)
}

describe('requestMedsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(startMedsOrder).mockResolvedValue({ alreadyInProgress: false, result: {} } as any)
  })

  it('rejects with requester_unidentified when the user has an empty name', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: '', role: 'member', addedAt: 1 } as any)
    const result = await run({ medications: ['ibuprofeno'] })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startMedsOrder).not.toHaveBeenCalled()
  })

  it('rejects with requester_unidentified when the user cannot be resolved', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue(null)
    const result = await run({ medications: ['ibuprofeno'] })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startMedsOrder).not.toHaveBeenCalled()
  })

  it('starts the order with the resolved name as requestedBy', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: 'Ana', role: 'member', addedAt: 1 } as any)
    await run({ medications: ['ibuprofeno'] })
    expect(startMedsOrder).toHaveBeenCalledWith({}, { medications: ['ibuprofeno'], requestedBy: 'Ana' })
  })
})
```

- [ ] **Step 11: Run the request-tool test to verify it fails**

Run: `pnpm exec vitest run src/mastra/tools/meds-request-tool.test.ts`
Expected: FAIL — the tool currently starts the order even with an empty name.

- [ ] **Step 12: Add the guard to the meds tool**

`src/mastra/tools/meds-request-tool.ts`, replace `execute`:

```ts
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        if (!user?.name?.trim()) {
            return {
                ok: false,
                reason: 'requester_unidentified',
                message: 'Todavía no sé tu nombre, así que no registré el pedido. ¿Cómo te llamás?',
            }
        }
        return startMedsOrder(context.mastra as any, { ...input, requestedBy: user.name.trim() })
    },
```

- [ ] **Step 13: Run the request-tool test to verify it passes**

Run: `pnpm exec vitest run src/mastra/tools/meds-request-tool.test.ts`
Expected: PASS

- [ ] **Step 14: Typecheck (catches any dangling wait-prescriptions import)**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If it reports a missing `wait-prescriptions` module, remove the stale import it points to.

- [ ] **Step 15: Run the full suite**

Run: `pnpm test`
Expected: PASS (no test imports the deleted files).

- [ ] **Step 16: Commit**

```bash
git add src/mastra/workflows/meds/ src/mastra/lib/meds-run.ts src/mastra/tools/meds-request-tool.ts src/mastra/tools/meds-request-tool.test.ts
git commit -m "feat: start meds order directly with medications and required author"
```

---

### Task 5: Agent and supervisor instructions

**Files:**
- Modify: `src/mastra/agents/diapers-agent.ts` (responsibilities list)
- Modify: `src/mastra/agents/meds-agent.ts` (status wording + responsibilities list)
- Modify: `src/mastra/agents/refunds-agent.ts` (responsibilities list)
- Modify: `src/mastra/agents/mostro-supervisor.ts` (User management block)

**Interfaces:**
- Consumes: the tools' rejection shape `{ ok: false, reason: 'requester_unidentified', message }` from Tasks 2-4.
- Produces: instruction text only — no code contract.

- [ ] **Step 1: Diapers agent — relay the rejection**

In `src/mastra/agents/diapers-agent.ts`, in the "Your responsibilities" list, add a bullet right after the `requestDiapersTool` bullet (line 23):

```
- If requestDiapersTool returns { ok: false, reason: 'requester_unidentified' }, do not retry — relay its message to the user verbatim so the supervisor can capture their name.
```

- [ ] **Step 2: Meds agent — drop the removed status and relay the rejection**

In `src/mastra/agents/meds-agent.ts`:

Change the status wording on line 18 — remove `prescriptions received / `:

```
- If the user asks about the status of the medication order, use getMedsStatusTool and explain it in plain language (sent to pharmacy / acknowledged by pharmacy / waiting for delivery date confirmation / notified).
```

Add a bullet after the `requestMedsTool` bullet (line 19):

```
- If requestMedsTool returns { ok: false, reason: 'requester_unidentified' }, do not retry — relay its message to the user verbatim so the supervisor can capture their name.
```

- [ ] **Step 3: Refunds agent — relay the rejection**

In `src/mastra/agents/refunds-agent.ts`, add a bullet after the `requestRefundTool` bullet (line 19):

```
- If requestRefundTool returns { ok: false, reason: 'requester_unidentified' }, do not retry — relay its message to the user verbatim so the supervisor can capture their name.
```

- [ ] **Step 4: Supervisor — capture the name and re-delegate**

In `src/mastra/agents/mostro-supervisor.ts`, in the `User management:` block, add a bullet after line 32 (the "change their name" bullet):

```
- If a shared-order agent reports that an order was not registered because the user's name is missing (reason 'requester_unidentified'), ask the user for their name, save it with setMyNameTool, then delegate the order again.
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/mastra/agents/diapers-agent.ts src/mastra/agents/meds-agent.ts src/mastra/agents/refunds-agent.ts src/mastra/agents/mostro-supervisor.ts
git commit -m "feat: guide agents to capture the requester name when an order lacks an author"
```

---

## Manual verification (after all tasks)

With Mongo wiped and the bot running (`pnpm dev` + ngrok):

1. Redeem an invite via a fresh Telegram account → the user document is created with `name` set to the Telegram display name (check Mongo / Studio).
2. As a user whose `name` is empty (edit the doc to `""`), ask for diapers → the agent asks for your name instead of placing the order; state has no run.
3. Provide your name → supervisor saves it with `setMyNameTool`; ask again → the order is placed and the run state shows `requestedBy`.
4. Repeat 2-3 for meds and refunds.
5. Meds happy path: ask to order medications directly → the run reaches `meds_requested` with `medications` and `requestedBy` set (no `prescriptions_received` step).
