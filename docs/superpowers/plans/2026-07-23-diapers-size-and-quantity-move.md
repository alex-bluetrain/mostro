# Diapers: talle (M/G/XG) y traslado de `quantity` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la solicitud de pañales pida un talle acotado (`M`/`G`/`XG`) en vez de un tipo libre, y que la cantidad la reciba la farmacia en la confirmación en lugar de pedirla al iniciar.

**Architecture:** El workflow de pañales es un `createWorkflow` de Mastra con estado tipado desde schemas Zod (`diapers-state.schema.ts`). Todos los campos de dominio se infieren de esos schemas, así que un rename de campo se propaga por TypeScript a steps, tools y el lib de arranque. El cambio se hace en dos slices verticales, cada uno dejando `tsc --noEmit` en verde: primero se relocaliza `quantity` (solicitud → confirmación), después se renombra `diaperType` → `size` con enum.

**Tech Stack:** TypeScript, Mastra (`@mastra/core`), Zod v4, Vitest, pnpm.

## Global Constraints

- Gestor de paquetes: **pnpm** (nunca npm). Tests: `pnpm test`. Typecheck: `pnpm exec tsc --noEmit`.
- Archivos bajo `workflows/diapers/` usan **comillas simples y sin `;`** (convención de `meds/` y `diapers/`). `index.ts` y `weather/` son legacy con comillas dobles y `;` — no se tocan acá.
- Campo en código: `size` (inglés, consistente con `quantity`/`deliveryDate`). El label "talle" es solo de cara al usuario/agente, vía `.describe(...)` y el prompt del agente.
- Valores del talle: enum `'M' | 'G' | 'XG'`. Se guarda el código corto; el significado (Mediano/Grande/Extra Grande) vive en descripciones.
- `quantity` en la confirmación es **requerida**: el webhook responde 400 si falta.
- Body saliente a la farmacia (`DIAPERS_MESSAGING_URL`) pasa a `{ size }`, sin `quantity`.
- Un archivo por entidad. Comentarios solo para un "por qué" no obvio, nunca para describir "qué hace".
- El baseline actual de `pnpm exec tsc --noEmit` es **exit 0 (verde)**: cualquier error de typecheck introducido es regresión.

---

### Task 1: Relocalizar `quantity` de la solicitud a la confirmación

Saca `quantity` del input de la solicitud (schema, tool, `startDiapers`, step de request y body a la farmacia) y lo agrega al resume de la confirmación (schema, wait step, `confirmDiapersDate`, validación del webhook). `diapers-state.schema.ts` mantiene `quantity` opcional (ahora se puebla en la confirmación). El campo de talle sigue llamándose `diaperType` en esta tarea — se renombra en la Task 2.

**Files:**
- Create: `src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.test.ts`
- Modify: `src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.ts`
- Modify: `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts`
- Modify: `src/mastra/workflows/diapers/steps/request-diapers.step.ts`
- Modify: `src/mastra/workflows/diapers/steps/wait-diapers-confirmation.step.ts`
- Modify: `src/mastra/lib/diapers-run.ts`
- Modify: `src/mastra/tools/diapers-request-tool.ts`
- Modify: `src/mastra/routes/webhook-diapers.route.ts`
- Modify: `src/mastra/agents/diapers-agent.ts`

**Interfaces:**
- Produces: `waitDiapersConfirmationResumeSchema` con forma `{ deliveryDate: string, deliveryAddress: string, quantity: number }`.
- Produces: `requestDiapersInputSchema` con forma `{ diaperType: string, requestedBy?: string }` (sin `quantity`).
- Produces: `startDiapers(mastra, { diaperType: string, yearMonth?: string, requestedBy?: string })` (sin `quantity`).
- Produces: `confirmDiapersDate(mastra, { deliveryDate: string, deliveryAddress: string, quantity: number, yearMonth: string })`.

- [ ] **Step 1: Escribir el test que falla del resume schema**

Crear `src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { waitDiapersConfirmationResumeSchema } from './wait-diapers-confirmation-resume.schema'

describe('waitDiapersConfirmationResumeSchema', () => {
    it('acepta una confirmación con quantity', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
            quantity: 12,
        })
        expect(result.success).toBe(true)
    })

    it('rechaza una confirmación sin quantity', () => {
        const result = waitDiapersConfirmationResumeSchema.safeParse({
            deliveryDate: '2026-08-01',
            deliveryAddress: 'Av. Siempre Viva 742',
        })
        expect(result.success).toBe(false)
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm exec vitest run src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.test.ts`
Expected: FALLA — el caso "rechaza … sin quantity" espera `success: false` pero el schema actual no tiene `quantity`, así que parsea OK y da `true`.

- [ ] **Step 3: Agregar `quantity` al resume schema**

Reemplazar el contenido de `src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.ts` por:

```ts
import { z } from 'zod'

export const waitDiapersConfirmationResumeSchema = z.object({
    // Payload del webhook de la farmacia: la farmacia nos indica la cantidad al confirmar
    deliveryDate: z.string(),
    deliveryAddress: z.string(),
    quantity: z.number(),
})
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm exec vitest run src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.test.ts`
Expected: PASA (2 tests).

- [ ] **Step 5: Sacar `quantity` del input schema de la solicitud**

Reemplazar el contenido de `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts` por:

```ts
import { z } from 'zod'

export const requestDiapersInputSchema = z.object({
    diaperType: z.string(),
    requestedBy: z.string().optional(),
})
```

- [ ] **Step 6: Escribir `quantity` en el state en el wait step**

En `src/mastra/workflows/diapers/steps/wait-diapers-confirmation.step.ts`, reemplazar el bloque `await setState({ ... })` por:

```ts
        await setState({
            ...state,
            status: 'diapers_date_confirmed',
            deliveryDate: toUnix(resumeData.deliveryDate),
            deliveryAddress: resumeData.deliveryAddress,
            quantity: resumeData.quantity,
        })
```

- [ ] **Step 7: Sacar `quantity` del request step (state y body a la farmacia)**

En `src/mastra/workflows/diapers/steps/request-diapers.step.ts`:

Reemplazar el bloque `await setState({ ... })` por (sin la línea `quantity`):

```ts
        await setState({
            ...state,
            status: 'diapers_requested',
            diaperType: inputData.diaperType,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })
```

Y reemplazar el `body: JSON.stringify({ ... })` de la llamada `fetch` por (solo el tipo):

```ts
                body: JSON.stringify({
                    type: inputData.diaperType,
                }),
```

- [ ] **Step 8: Sacar `quantity` de `startDiapers` y agregarlo a `confirmDiapersDate`**

En `src/mastra/lib/diapers-run.ts`:

Reemplazar la firma y el cuerpo de `startDiapers` por:

```ts
export async function startDiapers(
    mastra: Mastra,
    input: { diaperType: string; yearMonth?: string; requestedBy?: string },
) {
    const yearMonth = input.yearMonth ?? getCurrentYearMonth()
    const runId = getDiapersRunId(yearMonth)
    const workflow = getDiapersWorkflow(mastra)
    const existing = await workflow.getWorkflowRunById(runId)

    if (existing) {
        const reader = createWorkflowStateReader(existing)
        const status = reader.getStatus()
        if (status === 'suspended' || status === 'running') {
            return { alreadyInProgress: true as const, status }
        }
    }

    const run = await workflow.createRun({ runId })
    const result = await run.start({ inputData: { diaperType: input.diaperType, requestedBy: input.requestedBy } })

    return { alreadyInProgress: false as const, result }
}
```

Reemplazar la firma y el cuerpo de `confirmDiapersDate` por:

```ts
export async function confirmDiapersDate(
    mastra: Mastra,
    payload: { deliveryDate: string; deliveryAddress: string; quantity: number; yearMonth: string },
) {
    const workflow = getDiapersWorkflow(mastra)
    const run = await workflow.createRun({ runId: getDiapersRunId(payload.yearMonth) })

    return run.resume({ resumeData: { deliveryDate: payload.deliveryDate, deliveryAddress: payload.deliveryAddress, quantity: payload.quantity } })
}
```

- [ ] **Step 9: Sacar `quantity` del input del tool de solicitud**

En `src/mastra/tools/diapers-request-tool.ts`, reemplazar el `inputSchema` por (sin `quantity`):

```ts
    inputSchema: z.object({
        diaperType: z.string().describe('Talla o tipo de pañal, ej. "talla M"'),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes al que scopear el pedido, formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
```

- [ ] **Step 10: Validar `quantity` en el webhook de la farmacia**

En `src/mastra/routes/webhook-diapers.route.ts`, agregar la validación de `quantity` justo debajo del check de `yearMonth`:

```ts
            if (!body?.yearMonth) {
                return c.json({ ok: false, error: "yearMonth (YYYY-MM) is required" }, 400);
            }

            if (typeof body?.quantity !== "number") {
                return c.json({ ok: false, error: "quantity (number) is required" }, 400);
            }
```

- [ ] **Step 11: Actualizar el prompt del agente (no pedir cantidad)**

En `src/mastra/agents/diapers-agent.ts`, reemplazar la línea de la responsabilidad de pedido por:

```ts
- If the user wants to order diapers, use requestDiapersTool with the diaper type. If a request is already in progress for that month, tell them so instead of starting a new one.
```

- [ ] **Step 12: Verificar typecheck en verde**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0, sin output. (Si aparece un error del tipo `Object literal may only specify known properties` por `quantity`, quedó una referencia sin migrar.)

- [ ] **Step 13: Correr toda la suite de tests**

Run: `pnpm test`
Expected: PASA, incluyendo los 2 tests nuevos del resume schema.

- [ ] **Step 14: Commit**

```bash
git add src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.ts \
        src/mastra/workflows/diapers/schemas/wait-diapers-confirmation-resume.schema.test.ts \
        src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts \
        src/mastra/workflows/diapers/steps/request-diapers.step.ts \
        src/mastra/workflows/diapers/steps/wait-diapers-confirmation.step.ts \
        src/mastra/lib/diapers-run.ts \
        src/mastra/tools/diapers-request-tool.ts \
        src/mastra/routes/webhook-diapers.route.ts \
        src/mastra/agents/diapers-agent.ts
git commit -m "feat: pharmacy reports diaper quantity at confirmation instead of at request"
```

---

### Task 2: Renombrar `diaperType` → `size` con enum M/G/XG

Renombra el campo de talle en todo el dominio: input schema, state schema, request step (incluido el body a la farmacia), notify step, tool, `startDiapers` y el prompt del agente. El valor pasa de string libre a enum `'M' | 'G' | 'XG'`.

**Files:**
- Create: `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts`
- Modify: `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts`
- Modify: `src/mastra/workflows/diapers/schemas/diapers-state.schema.ts`
- Modify: `src/mastra/workflows/diapers/steps/request-diapers.step.ts`
- Modify: `src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts`
- Modify: `src/mastra/lib/diapers-run.ts`
- Modify: `src/mastra/tools/diapers-request-tool.ts`
- Modify: `src/mastra/agents/diapers-agent.ts`

**Interfaces:**
- Consumes (de Task 1): `requestDiapersInputSchema` con forma `{ diaperType: string, requestedBy?: string }`; `startDiapers(mastra, { diaperType, yearMonth?, requestedBy? })`.
- Produces: `requestDiapersInputSchema` con forma `{ size: 'M' | 'G' | 'XG', requestedBy?: string }`.
- Produces: `diapersStateSchema` con `size?: 'M' | 'G' | 'XG'` (reemplaza `diaperType?`).
- Produces: `startDiapers(mastra, { size: 'M' | 'G' | 'XG', yearMonth?: string, requestedBy?: string })`.

- [ ] **Step 1: Escribir el test que falla del input schema (enum size)**

Crear `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { requestDiapersInputSchema } from './request-diapers-input.schema'

describe('requestDiapersInputSchema', () => {
    it.each(['M', 'G', 'XG'])('acepta el talle %s', (size) => {
        const result = requestDiapersInputSchema.safeParse({ size })
        expect(result.success).toBe(true)
    })

    it('rechaza un talle fuera del enum', () => {
        const result = requestDiapersInputSchema.safeParse({ size: 'L' })
        expect(result.success).toBe(false)
    })

    it('rechaza una solicitud sin talle', () => {
        const result = requestDiapersInputSchema.safeParse({ requestedBy: 'Ana' })
        expect(result.success).toBe(false)
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm exec vitest run src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts`
Expected: FALLA — el schema todavía tiene `diaperType` (no `size`), así que los casos con `{ size }` no cumplen y `{ size: 'L' }` no es rechazado por un enum inexistente.

- [ ] **Step 3: Cambiar el input schema a enum `size`**

Reemplazar el contenido de `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts` por:

```ts
import { z } from 'zod'

export const requestDiapersInputSchema = z.object({
    size: z.enum(['M', 'G', 'XG']),
    requestedBy: z.string().optional(),
})
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm exec vitest run src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts`
Expected: PASA (5 tests).

- [ ] **Step 5: Renombrar `diaperType` → `size` en el state schema**

En `src/mastra/workflows/diapers/schemas/diapers-state.schema.ts`, reemplazar la línea `diaperType: z.string().optional(),` por:

```ts
    size: z.enum(['M', 'G', 'XG']).optional(),
```

- [ ] **Step 6: Actualizar el request step (`size` en state y body)**

En `src/mastra/workflows/diapers/steps/request-diapers.step.ts`:

Reemplazar la línea `diaperType: inputData.diaperType,` dentro de `setState` por:

```ts
            size: inputData.size,
```

Y reemplazar el `body: JSON.stringify({ ... })` del `fetch` por:

```ts
                body: JSON.stringify({
                    size: inputData.size,
                }),
```

- [ ] **Step 7: Actualizar el notify step (`state.size`)**

En `src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts`:

Reemplazar el `summary` por (usa `state.size`):

```ts
                        summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: los pañales (talle ${state.size ?? 'sin especificar'}) llegan el ${state.deliveryDate != null ? formatUnixDate(state.deliveryDate) : 'fecha a confirmar'}.`,
```

Y en el `payload`, reemplazar la línea `diaperType: state.diaperType,` por:

```ts
                            size: state.size,
```

- [ ] **Step 8: Renombrar `diaperType` → `size` en `startDiapers`**

En `src/mastra/lib/diapers-run.ts`, en `startDiapers`:

Reemplazar la firma del parámetro `input` por:

```ts
    input: { size: 'M' | 'G' | 'XG'; yearMonth?: string; requestedBy?: string },
```

Y reemplazar la línea del `run.start` por:

```ts
    const result = await run.start({ inputData: { size: input.size, requestedBy: input.requestedBy } })
```

- [ ] **Step 9: Actualizar el tool de solicitud (input `size` enum)**

En `src/mastra/tools/diapers-request-tool.ts`:

Reemplazar el `inputSchema` por:

```ts
    inputSchema: z.object({
        size: z.enum(['M', 'G', 'XG']).describe('Talle del pañal: M (Mediano), G (Grande), XG (Extra Grande)'),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mes al que scopear el pedido, formato YYYY-MM. Si no se indica, se usa el mes actual.'),
    }),
```

Y actualizar la `description` del tool para reflejar "talle" en vez de "tipo":

```ts
    description: 'Inicia el pedido compartido de pañales por talle (M/G/XG). Si ya hay un pedido en curso ese mes, informa el estado actual en vez de duplicarlo. El pedido queda scopeado al mes en que se crea (YYYY-MM).',
```

- [ ] **Step 10: Actualizar el prompt del agente (pedir talle M/G/XG)**

En `src/mastra/agents/diapers-agent.ts`, reemplazar la línea de la responsabilidad de pedido por:

```ts
- If the user wants to order diapers, use requestDiapersTool with the diaper size (talle): M (Mediano), G (Grande) or XG (Extra Grande). If a request is already in progress for that month, tell them so instead of starting a new one.
```

- [ ] **Step 11: Verificar typecheck en verde**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0, sin output. (Un error `Property 'diaperType' does not exist` señala una referencia sin migrar.)

- [ ] **Step 12: Correr toda la suite de tests**

Run: `pnpm test`
Expected: PASA, incluyendo los 5 tests nuevos del input schema y los 2 del resume schema de la Task 1.

- [ ] **Step 13: Commit**

```bash
git add src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts \
        src/mastra/workflows/diapers/schemas/request-diapers-input.schema.test.ts \
        src/mastra/workflows/diapers/schemas/diapers-state.schema.ts \
        src/mastra/workflows/diapers/steps/request-diapers.step.ts \
        src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts \
        src/mastra/lib/diapers-run.ts \
        src/mastra/tools/diapers-request-tool.ts \
        src/mastra/agents/diapers-agent.ts
git commit -m "feat: order diapers by size (M/G/XG) instead of free-text type"
```

---

## Notas de verificación manual (post-implementación)

- El `outputSchema` de `getDiapersStatusTool` es `diapersStateSchema.nullable()`, así que el rename a `size` se refleja solo en la respuesta de estado sin cambios extra.
- No se tocan identity/subscribers ni el resto de campos del dominio (`deliveryDate`, `deliveryAddress`, `requestedBy`).
- `diapers-flow.md` y los docs de planes anteriores quedan fuera de alcance (declarado en el spec).
