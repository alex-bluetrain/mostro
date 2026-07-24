# Resume guard for diapers and meds webhooks

## Problem

The lib functions `confirmDiapersDate`, `confirmMedsDelivery`, and `acknowledgeMedsOrder`
call `workflow.createRun({ runId }).resume(...)` without validating the run first.

`createRun({ runId })` does not load and validate an existing snapshot: if no snapshot
exists for that `runId`, it creates a fresh empty run reference, and `resume()` then runs
against something that was never `suspended`. When the run does not exist, is not
`suspended`, or is suspended at a different step, the `resume()` either fails or applies
resume data to the wrong step.

The webhooks compound this: they ignore the return value of the lib call and always
respond `{ ok: true }` with HTTP 200, so any failure is swallowed.

The correct pattern already exists in the same codebase: `startDiapers` /
`startMedsOrder` do `getWorkflowRunById` → `createWorkflowStateReader` →
`reader.getStatus()` and branch on the state.

## Goal

Before resuming, validate that:

1. the run exists,
2. it is in `suspended` status,
3. the suspended step is the one expected for that action,

and have the webhook return an HTTP status that reflects the outcome.

## Scope

In scope:

- `confirmDiapersDate` (`src/mastra/lib/diapers-run.ts`)
- `confirmMedsDelivery` and `acknowledgeMedsOrder` (`src/mastra/lib/meds-run.ts`)
- The three matching route handlers.

Out of scope (YAGNI):

- `startDiapers` / `startMedsOrder` — already validate run state.
- The `refunds` workflow — same pattern, but not requested.
- Extracting a shared helper — the guard stays inline in each function (~8 repeated
  lines in three places), consistent with the existing inline pattern in the start functions.

## Design

### Lib layer: discriminated result

Each of the three functions returns a discriminated union instead of the raw resume result:

```ts
type ResumeOutcome =
  | { ok: true; result: WorkflowResult }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'not_suspended'; status: WorkflowRunStatus }
  | { ok: false; reason: 'wrong_step'; suspendedStep?: string; expected: string }
```

Guard sequence (reuses the exact pattern from `startDiapers`):

```ts
const existing = await workflow.getWorkflowRunById(runId)
if (!existing) return { ok: false, reason: 'not_found' }

const reader = createWorkflowStateReader(existing)
const status = reader.getStatus()
if (status !== 'suspended') return { ok: false, reason: 'not_suspended', status }

const suspendedStep = reader.getSuspendedStep()?.stepId
if (suspendedStep !== EXPECTED_STEP)
  return { ok: false, reason: 'wrong_step', suspendedStep, expected: EXPECTED_STEP }

const run = await workflow.createRun({ runId })
return { ok: true, result: await run.resume({ resumeData }) }
```

`EXPECTED_STEP` per function:

| Function                | Expected suspended step     |
| ----------------------- | --------------------------- |
| `confirmDiapersDate`    | `wait-diapers-confirmation` |
| `confirmMedsDelivery`   | `wait-meds-confirmation`    |
| `acknowledgeMedsOrder`  | `wait-meds-acknowledge`     |

On any `ok: false` branch, `createRun` / `resume` are never called.

### Webhook layer: HTTP mapping

The three route handlers stop ignoring the result and map `reason` to HTTP:

| reason          | HTTP | body                                                        |
| --------------- | ---- | ----------------------------------------------------------- |
| `not_found`     | 404  | `{ ok: false, error: 'run not found' }`                     |
| `not_suspended` | 409  | `{ ok: false, error: 'run not suspended', status }`         |
| `wrong_step`    | 409  | `{ ok: false, error: 'unexpected step', suspendedStep, expected }` |
| (ok)            | 200  | `{ ok: true }`                                              |

Positive side effect: a double-confirm (run already in `success`) now returns 409 instead
of failing silently.

## Testing

Vitest (`pnpm test` → `vitest run`). Unit tests per function with a mocked `mastra`:
stub `getWorkflow` to return an object whose `getWorkflowRunById`, `createRun`, and the
`createWorkflowStateReader`-visible state are controlled per case. Cases per function:

- **run missing** → `getWorkflowRunById` returns `null` → `{ ok: false, reason: 'not_found' }`,
  and `createRun` / `resume` are never called.
- **status not suspended** (e.g. `success`) → `{ ok: false, reason: 'not_suspended', status: 'success' }`,
  no resume.
- **suspended at wrong step** (e.g. meds confirm while suspended at `wait-meds-acknowledge`)
  → `{ ok: false, reason: 'wrong_step', ... }`, no resume.
- **happy path** → suspended at the expected step → `resume` called with the correct
  `resumeData` → `{ ok: true }`.

Route-level tests (reason → HTTP mapping) are optional; the logic lives in the lib layer,
which is where the unit coverage sits.

## Affected files

| File                                               | Change                                                    |
| -------------------------------------------------- | --------------------------------------------------------- |
| `src/mastra/lib/diapers-run.ts`                    | Guard in `confirmDiapersDate`, new return type            |
| `src/mastra/lib/meds-run.ts`                       | Guard in `confirmMedsDelivery` and `acknowledgeMedsOrder` |
| `src/mastra/routes/webhook-diapers.route.ts`       | reason → HTTP mapping                                     |
| `src/mastra/routes/webhook-meds-confirm.route.ts`  | reason → HTTP mapping                                     |
| `src/mastra/routes/webhook-meds-ack.route.ts`      | reason → HTTP mapping                                     |
| `src/mastra/lib/*.test.ts` (new)                   | Guard unit tests                                          |
