# Resume Guard for Diapers and Meds Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guard `confirmDiapersDate`, `confirmMedsDelivery`, and `acknowledgeMedsOrder` so they only resume a workflow run that exists, is `suspended`, and is suspended at the expected step — and have the webhooks return an HTTP status that reflects the outcome.

**Architecture:** Each lib function fetches the run with `getWorkflowRunById`, inspects it with `createWorkflowStateReader` (the exact pattern already used by `startDiapers`), and returns a discriminated result (`{ ok: true, result } | { ok: false, reason }`) instead of the raw resume value. The three route handlers map that result to HTTP 200/404/409. The guard is inline per function (no shared helper).

**Tech Stack:** TypeScript (ES2022 modules), Mastra `@mastra/core` v1.48.0 workflows, Hono route handlers (`registerApiRoute`), Vitest for tests, pnpm for scripts.

## Global Constraints

- Use **pnpm** for all scripts (`pnpm test`, `pnpm build`) — the repo uses `pnpm-lock.yaml`.
- Load the `mastra` skill before touching workflow APIs; do not rely on cached Mastra knowledge.
- TypeScript targets ES2022 modules.
- Do NOT extract a shared guard helper function — the guard stays inline in each lib function (matches the existing inline pattern in `startDiapers` / `startMedsOrder`).
- Return discriminated unions via `as const` object literals — no named result type — matching `startDiapers`'s `{ alreadyInProgress: true as const, status }` style.
- Out of scope: `startDiapers` / `startMedsOrder` (already validate), the `refunds` workflow, any shared helper module.
- Expected suspended step IDs: `confirmDiapersDate` → `wait-diapers-confirmation`; `confirmMedsDelivery` → `wait-meds-confirmation`; `acknowledgeMedsOrder` → `wait-meds-acknowledge`.
- Commit messages: English, no co-authorship or tooling mentions.

---

### Task 1: Guard `confirmDiapersDate`

**Files:**
- Modify: `src/mastra/lib/diapers-run.ts:45-53`
- Test: `src/mastra/lib/diapers-run.test.ts` (create)

**Interfaces:**
- Consumes: existing `getDiapersWorkflow(mastra)`, `getDiapersRunId(yearMonth)`, and `createWorkflowStateReader` (already imported in the file).
- Produces: `confirmDiapersDate(mastra, payload)` returning one of:
  - `{ ok: true; result: <resume result> }`
  - `{ ok: false; reason: 'not_found' }`
  - `{ ok: false; reason: 'not_suspended'; status: string }`
  - `{ ok: false; reason: 'wrong_step'; suspendedStep?: string; expected: string }`

- [ ] **Step 1: Write the failing tests**

Create `src/mastra/lib/diapers-run.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@mastra/core/workflows', async (importActual) => {
    const actual = await importActual<typeof import('@mastra/core/workflows')>()
    return { ...actual, createWorkflowStateReader: vi.fn() }
})

import { createWorkflowStateReader } from '@mastra/core/workflows'
import { confirmDiapersDate } from './diapers-run'

const readerMock = vi.mocked(createWorkflowStateReader)

function buildMastra(opts: {
    existing: unknown
    resume?: ReturnType<typeof vi.fn>
}) {
    const resume = opts.resume ?? vi.fn().mockResolvedValue({ status: 'success' })
    const createRun = vi.fn().mockResolvedValue({ resume })
    const workflow = {
        getWorkflowRunById: vi.fn().mockResolvedValue(opts.existing),
        createRun,
    }
    const mastra = { getWorkflow: vi.fn().mockReturnValue(workflow) }
    return { mastra: mastra as never, workflow, createRun, resume }
}

const payload = {
    deliveryDate: '2026-08-01',
    deliveryAddress: 'Av. Siempre Viva 742',
    quantity: 12,
    yearMonth: '2026-08',
}

describe('confirmDiapersDate', () => {
    it('returns not_found and never resumes when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await confirmDiapersDate(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns not_suspended and never resumes when status is not suspended', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        readerMock.mockReturnValue({
            getStatus: () => 'success',
            getSuspendedStep: () => undefined,
        } as never)

        const result = await confirmDiapersDate(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_suspended', status: 'success' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step and never resumes when suspended at another step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        readerMock.mockReturnValue({
            getStatus: () => 'suspended',
            getSuspendedStep: () => ({ stepId: 'notify-users' }),
        } as never)

        const result = await confirmDiapersDate(mastra, payload)

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'notify-users',
            expected: 'wait-diapers-confirmation',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with the confirmation data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        readerMock.mockReturnValue({
            getStatus: () => 'suspended',
            getSuspendedStep: () => ({ stepId: 'wait-diapers-confirmation' }),
        } as never)

        const result = await confirmDiapersDate(mastra, payload)

        expect(resume).toHaveBeenCalledWith({
            resumeData: {
                deliveryDate: '2026-08-01',
                deliveryAddress: 'Av. Siempre Viva 742',
                quantity: 12,
            },
        })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/mastra/lib/diapers-run.test.ts`
Expected: FAIL — `confirmDiapersDate` currently returns the raw resume result, so `not_found` / `not_suspended` / `wrong_step` assertions fail and `createRun` is called when it should not be.

- [ ] **Step 3: Implement the guard**

Replace `confirmDiapersDate` (currently `src/mastra/lib/diapers-run.ts:45-53`) with:

```ts
export async function confirmDiapersDate(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; quantity: number; yearMonth: string },
) {
    const workflow = getDiapersWorkflow(mastra)
    const runId = getDiapersRunId(payload.yearMonth)
    const existing = await workflow.getWorkflowRunById(runId)

    if (!existing) {
        return { ok: false as const, reason: 'not_found' as const }
    }

    const reader = createWorkflowStateReader(existing)
    const status = reader.getStatus()
    if (status !== 'suspended') {
        return { ok: false as const, reason: 'not_suspended' as const, status }
    }

    const suspendedStep = reader.getSuspendedStep()?.stepId
    const expected = 'wait-diapers-confirmation'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({
        resumeData: {
            deliveryDate: payload.deliveryDate,
            deliveryAddress: payload.deliveryAddress,
            quantity: payload.quantity,
        },
    })

    return { ok: true as const, result }
}
```

Note: `createWorkflowStateReader` is already imported at `src/mastra/lib/diapers-run.ts:2`. No new import needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/mastra/lib/diapers-run.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/diapers-run.ts src/mastra/lib/diapers-run.test.ts
git commit -m "feat: guard diapers confirmation against invalid or non-suspended runs"
```

---

### Task 2: Guard `confirmMedsDelivery` and `acknowledgeMedsOrder`

**Files:**
- Modify: `src/mastra/lib/meds-run.ts:46-61`
- Test: `src/mastra/lib/meds-run.test.ts` (create)

**Interfaces:**
- Consumes: existing `getMedsWorkflow(mastra)`, `getMedsRunId(yearMonth)`, and `createWorkflowStateReader` (already imported in the file).
- Produces:
  - `acknowledgeMedsOrder(mastra, yearMonth)` → same discriminated union as Task 1, expected step `wait-meds-acknowledge`, resumes with `resumeData: {}`.
  - `confirmMedsDelivery(mastra, payload)` → same discriminated union, expected step `wait-meds-confirmation`, resumes with `resumeData: { deliveryDate, deliveryAddress }`.

- [ ] **Step 1: Write the failing tests**

Create `src/mastra/lib/meds-run.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@mastra/core/workflows', async (importActual) => {
    const actual = await importActual<typeof import('@mastra/core/workflows')>()
    return { ...actual, createWorkflowStateReader: vi.fn() }
})

import { createWorkflowStateReader } from '@mastra/core/workflows'
import { acknowledgeMedsOrder, confirmMedsDelivery } from './meds-run'

const readerMock = vi.mocked(createWorkflowStateReader)

function buildMastra(opts: {
    existing: unknown
    resume?: ReturnType<typeof vi.fn>
}) {
    const resume = opts.resume ?? vi.fn().mockResolvedValue({ status: 'success' })
    const createRun = vi.fn().mockResolvedValue({ resume })
    const workflow = {
        getWorkflowRunById: vi.fn().mockResolvedValue(opts.existing),
        createRun,
    }
    const mastra = { getWorkflow: vi.fn().mockReturnValue(workflow) }
    return { mastra: mastra as never, workflow, createRun, resume }
}

function reader(status: string, suspendedStep?: string) {
    readerMock.mockReturnValue({
        getStatus: () => status,
        getSuspendedStep: () => (suspendedStep ? { stepId: suspendedStep } : undefined),
    } as never)
}

describe('acknowledgeMedsOrder', () => {
    it('returns not_found when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns not_suspended when status is not suspended', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('success')

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(result).toEqual({ ok: false, reason: 'not_suspended', status: 'success' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step when suspended at the confirmation step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('suspended', 'wait-meds-confirmation')

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'wait-meds-confirmation',
            expected: 'wait-meds-acknowledge',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with empty data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        reader('suspended', 'wait-meds-acknowledge')

        const result = await acknowledgeMedsOrder(mastra, '2026-08')

        expect(resume).toHaveBeenCalledWith({ resumeData: {} })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})

describe('confirmMedsDelivery', () => {
    const payload = {
        deliveryDate: '2026-08-01',
        deliveryAddress: 'Av. Siempre Viva 742',
        yearMonth: '2026-08',
    }

    it('returns not_found when the run does not exist', async () => {
        const { mastra, createRun } = buildMastra({ existing: null })

        const result = await confirmMedsDelivery(mastra, payload)

        expect(result).toEqual({ ok: false, reason: 'not_found' })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('returns wrong_step when suspended at the acknowledge step', async () => {
        const { mastra, createRun } = buildMastra({ existing: {} })
        reader('suspended', 'wait-meds-acknowledge')

        const result = await confirmMedsDelivery(mastra, payload)

        expect(result).toEqual({
            ok: false,
            reason: 'wrong_step',
            suspendedStep: 'wait-meds-acknowledge',
            expected: 'wait-meds-confirmation',
        })
        expect(createRun).not.toHaveBeenCalled()
    })

    it('resumes with the delivery data on the happy path', async () => {
        const resume = vi.fn().mockResolvedValue({ status: 'success' })
        const { mastra } = buildMastra({ existing: {}, resume })
        reader('suspended', 'wait-meds-confirmation')

        const result = await confirmMedsDelivery(mastra, payload)

        expect(resume).toHaveBeenCalledWith({
            resumeData: {
                deliveryDate: '2026-08-01',
                deliveryAddress: 'Av. Siempre Viva 742',
            },
        })
        expect(result).toEqual({ ok: true, result: { status: 'success' } })
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/mastra/lib/meds-run.test.ts`
Expected: FAIL — both functions currently return the raw resume result and always call `createRun`.

- [ ] **Step 3: Implement the guards**

Replace `acknowledgeMedsOrder` and `confirmMedsDelivery` (currently `src/mastra/lib/meds-run.ts:46-61`) with:

```ts
export async function acknowledgeMedsOrder(mastra: Mastra, yearMonth: string) {
    const workflow = getMedsWorkflow(mastra)
    const runId = getMedsRunId(yearMonth)
    const existing = await workflow.getWorkflowRunById(runId)

    if (!existing) {
        return { ok: false as const, reason: 'not_found' as const }
    }

    const reader = createWorkflowStateReader(existing)
    const status = reader.getStatus()
    if (status !== 'suspended') {
        return { ok: false as const, reason: 'not_suspended' as const, status }
    }

    const suspendedStep = reader.getSuspendedStep()?.stepId
    const expected = 'wait-meds-acknowledge'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({ resumeData: {} })

    return { ok: true as const, result }
}

export async function confirmMedsDelivery(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; yearMonth: string },
) {
    const workflow = getMedsWorkflow(mastra)
    const runId = getMedsRunId(payload.yearMonth)
    const existing = await workflow.getWorkflowRunById(runId)

    if (!existing) {
        return { ok: false as const, reason: 'not_found' as const }
    }

    const reader = createWorkflowStateReader(existing)
    const status = reader.getStatus()
    if (status !== 'suspended') {
        return { ok: false as const, reason: 'not_suspended' as const, status }
    }

    const suspendedStep = reader.getSuspendedStep()?.stepId
    const expected = 'wait-meds-confirmation'
    if (suspendedStep !== expected) {
        return { ok: false as const, reason: 'wrong_step' as const, suspendedStep, expected }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.resume({
        resumeData: {
            deliveryDate: payload.deliveryDate,
            deliveryAddress: payload.deliveryAddress,
        },
    })

    return { ok: true as const, result }
}
```

Note: `createWorkflowStateReader` is already imported at `src/mastra/lib/meds-run.ts:2`. No new import needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/mastra/lib/meds-run.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/meds-run.ts src/mastra/lib/meds-run.test.ts
git commit -m "feat: guard meds acknowledge and confirmation against invalid or non-suspended runs"
```

---

### Task 3: Map the diapers webhook result to HTTP

**Files:**
- Modify: `src/mastra/routes/webhook-diapers.route.ts:29-31`

**Interfaces:**
- Consumes: `confirmDiapersDate` discriminated union from Task 1.
- Produces: HTTP response — 200 on `ok`, 404 on `not_found`, 409 on `not_suspended` / `wrong_step`.

- [ ] **Step 1: Replace the result handling**

In `src/mastra/routes/webhook-diapers.route.ts`, replace the current block (lines 29-31):

```ts
            const result = await confirmDiapersDate(mastra, body);
            console.log("/webhooks/diapers", JSON.stringify(result));
            return c.json({ ok: true }, 200);
```

with:

```ts
            const result = await confirmDiapersDate(mastra, body);
            console.log("/webhooks/diapers", JSON.stringify(result));

            if (!result.ok) {
                if (result.reason === "not_found") {
                    return c.json({ ok: false, error: "run not found" }, 404);
                }
                if (result.reason === "not_suspended") {
                    return c.json({ ok: false, error: "run not suspended", status: result.status }, 409);
                }
                return c.json(
                    { ok: false, error: "unexpected step", suspendedStep: result.suspendedStep, expected: result.expected },
                    409,
                );
            }

            return c.json({ ok: true }, 200);
```

- [ ] **Step 2: Typecheck the route via build**

Run: `pnpm build`
Expected: build succeeds with no TypeScript errors — the discriminated union narrows correctly (`result.status` only accessed in the `not_suspended` branch, `result.suspendedStep` / `result.expected` only in the fallthrough `wrong_step` branch).

- [ ] **Step 3: Commit**

```bash
git add src/mastra/routes/webhook-diapers.route.ts
git commit -m "feat: return 404/409 from diapers webhook on invalid run state"
```

---

### Task 4: Map the meds webhooks result to HTTP

**Files:**
- Modify: `src/mastra/routes/webhook-meds-confirm.route.ts:17-19`
- Modify: `src/mastra/routes/webhook-meds-ack.route.ts:17-19`

**Interfaces:**
- Consumes: `confirmMedsDelivery` and `acknowledgeMedsOrder` discriminated unions from Task 2.
- Produces: HTTP response — 200 on `ok`, 404 on `not_found`, 409 on `not_suspended` / `wrong_step`.

- [ ] **Step 1: Replace the result handling in the confirm route**

In `src/mastra/routes/webhook-meds-confirm.route.ts`, replace the current block (lines 17-19):

```ts
            const result = await confirmMedsDelivery(mastra, body);
            console.log("/webhooks/meds/confirm", JSON.stringify(result));
            return c.json({ ok: true }, 200);
```

with:

```ts
            const result = await confirmMedsDelivery(mastra, body);
            console.log("/webhooks/meds/confirm", JSON.stringify(result));

            if (!result.ok) {
                if (result.reason === "not_found") {
                    return c.json({ ok: false, error: "run not found" }, 404);
                }
                if (result.reason === "not_suspended") {
                    return c.json({ ok: false, error: "run not suspended", status: result.status }, 409);
                }
                return c.json(
                    { ok: false, error: "unexpected step", suspendedStep: result.suspendedStep, expected: result.expected },
                    409,
                );
            }

            return c.json({ ok: true }, 200);
```

- [ ] **Step 2: Replace the result handling in the ack route**

In `src/mastra/routes/webhook-meds-ack.route.ts`, replace the current block (lines 17-19):

```ts
            const result = await acknowledgeMedsOrder(mastra, body.yearMonth);
            console.log("/webhooks/meds/ack", JSON.stringify(result));
            return c.json({ ok: true }, 200);
```

with:

```ts
            const result = await acknowledgeMedsOrder(mastra, body.yearMonth);
            console.log("/webhooks/meds/ack", JSON.stringify(result));

            if (!result.ok) {
                if (result.reason === "not_found") {
                    return c.json({ ok: false, error: "run not found" }, 404);
                }
                if (result.reason === "not_suspended") {
                    return c.json({ ok: false, error: "run not suspended", status: result.status }, 409);
                }
                return c.json(
                    { ok: false, error: "unexpected step", suspendedStep: result.suspendedStep, expected: result.expected },
                    409,
                );
            }

            return c.json({ ok: true }, 200);
```

- [ ] **Step 3: Typecheck the routes via build**

Run: `pnpm build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all existing tests plus the 11 new guard tests (4 diapers + 7 meds).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/routes/webhook-meds-confirm.route.ts src/mastra/routes/webhook-meds-ack.route.ts
git commit -m "feat: return 404/409 from meds webhooks on invalid run state"
```
