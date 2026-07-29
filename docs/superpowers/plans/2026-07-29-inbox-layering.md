# Estratificación del inbox (reader puro / poller dueño de la política) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar las responsabilidades del inbox en tres capas: `gmail-reader` como adaptador puro de Gmail (sin labels, sin ventana, sin promesa de orden), `poll-mailbox` como motor genérico dueño de toda la política (labels de estado, ventana, orden, filtro por consumidor, aviso de fallo inyectado), y los dominios (diapers/meds/refunds) aportando su config completa.

**Architecture:** Cuatro movimientos: (1) `InboxMessage` expone los headers del nodo raíz como array limpio; (2) el orden viejo→nuevo deja de ser un contrato implícito del reader y pasa a ser un sort explícito del poller; (3) las constantes `PROCESSED_LABEL`/`FAILED_LABEL`/`SEARCH_WINDOW` se mudan a `poll-mailbox`; (4) `PollConfig` se generaliza: `domain: string`, filtro grueso `query` + predicado fino `matches`, y `onFailure` como callback — el motor deja de conocer a sus tres clientes y de importar `notify-mail-failure`.

**Tech Stack:** TypeScript, vitest, `@googleapis/gmail`, Mastra (los steps de dominio usan `createPollStep`, que no cambia).

## Global Constraints

- Gestor de paquetes: **pnpm** (nunca npm).
- Typecheck: `pnpm exec tsc --noEmit` (no usar `mastra build`: falla con EBUSY si el dev server está corriendo).
- Tests: `pnpm exec vitest run <ruta>`.
- Comentarios y specs en español; commits en inglés, sin co-autoría ni menciones a Claude.
- Estilo del repo: 4 espacios, comillas simples, sin punto y coma, imports con path aliases (`@lib/...`, `@config/...`).
- Semántica nueva acordada: un mail que **no matchea** el filtro del consumidor se saltea **sin etiquetar y sin avisar** (puede ser de otro consumidor); `mostro-failed` queda reservado para "matcheó pero no pude procesarlo".

---

### Task 1: `InboxMessage.headers` — headers del nodo raíz, sin nulls

**Files:**
- Modify: `src/mastra/lib/inbox/gmail-reader.ts`
- Test: `src/mastra/lib/inbox/gmail-reader.test.ts`
- Modify: `src/mastra/lib/inbox/poll-mailbox.test.ts` (el helper `message()` debe cumplir el type nuevo)

**Interfaces:**
- Produces: `InboxMessage` gana el campo `headers: Array<{ name: string; value: string }>`. Solo los headers del nodo raíz del árbol MIME (los del mail en sí, no los de las parts). Misma estructura array-de-pares que la API de Google (preserva duplicados y orden), pero sin los `?`/`null` del codegen.

- [ ] **Step 1: Escribir el test que falla**

En `gmail-reader.test.ts`, dentro del `describe('createGmailReader().search')`, agregar:

```ts
    it('expone los headers del nodo raíz, sin nulls', async () => {
        const { client } = buildClient()

        const [message] = await createGmailReader(client).search('q')

        expect(message.headers).toEqual([
            { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
            { name: 'Subject', value: 'Confirmación de pedido' },
        ])
    })
```

Además, el primer test (`devuelve remitente, asunto y cuerpo decodificado`) usa `toEqual` con el objeto completo: agregar al objeto esperado la propiedad

```ts
            headers: [
                { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                { name: 'Subject', value: 'Confirmación de pedido' },
            ],
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm exec vitest run src/mastra/lib/inbox/gmail-reader.test.ts`
Expected: FAIL — `headers` es `undefined` en el objeto devuelto.

- [ ] **Step 3: Implementar**

En `gmail-reader.ts`:

1. Extender el type:

```ts
export type InboxMessage = {
    id: string
    from: string
    subject: string
    body: string
    receivedAt: Date
    // Solo los headers del nodo raíz (los del mail: From, Subject, Message-ID...);
    // los de las parts internas son metadata de encoding sin interés. Misma forma
    // array-de-pares que la API (los headers pueden repetirse y el orden importa),
    // pero sin los nulls del codegen de Google: Gmail siempre manda name y value.
    headers: Array<{ name: string; value: string }>
}
```

2. Agregar el helper junto a `headerOf`:

```ts
function headersOf(payload: Payload | undefined): Array<{ name: string; value: string }> {
    return (payload?.headers ?? []).flatMap(h => (h.name && h.value ? [{ name: h.name, value: h.value }] : []))
}
```

3. En el objeto que arma `search()`, agregar `headers: headersOf(payload),` después de `body`.

4. En `poll-mailbox.test.ts`, el helper `message()` debe cumplir el type: agregar `headers: [],` al objeto base (antes del spread de `overrides`).

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run src/mastra/lib/inbox/ && pnpm exec tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox/gmail-reader.ts src/mastra/lib/inbox/gmail-reader.test.ts src/mastra/lib/inbox/poll-mailbox.test.ts
git commit -m "feat: expose root MIME headers on InboxMessage"
```

---

### Task 2: el orden viejo→nuevo pasa del reader al poller

Hoy el orden es un invariante implementado en el reader pero del que depende el poller; el comentario de `PollDeps` admite que un reader alternativo lo rompería "en silencio, sin que falle ningún test". El poller pasa a ordenar él mismo (tiene `receivedAt`) y el reader devuelve los mensajes como los lista Gmail.

**Files:**
- Modify: `src/mastra/lib/inbox/gmail-reader.ts`
- Modify: `src/mastra/lib/inbox/poll-mailbox.ts`
- Test: `src/mastra/lib/inbox/poll-mailbox.test.ts`
- Test: `src/mastra/lib/inbox/gmail-reader.test.ts` (se elimina el test de orden)

**Interfaces:**
- Consumes: `InboxMessage.receivedAt: Date` (ya existente).
- Produces: `GmailReader.search()` ya NO garantiza orden. `runPollCycle` ordena internamente antes de iterar. Ningún type cambia.

- [ ] **Step 1: Escribir el test que falla**

En `poll-mailbox.test.ts`, agregar un `describe` nuevo:

```ts
describe('runPollCycle — orden de la tanda', () => {
    it('procesa del más viejo al más nuevo aunque el reader devuelva al revés', async () => {
        const { config } = buildConfig()
        const { deps, extract } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'nuevo', body: 'segundo', receivedAt: new Date('2026-07-15T10:00:00Z') }),
            message({ id: 'viejo', body: 'primero', receivedAt: new Date('2026-07-10T10:00:00Z') }),
        ])

        await runPollCycle({}, config, deps)

        expect(extract.mock.calls[0][1].body).toBe('primero')
        expect(extract.mock.calls[1][1].body).toBe('segundo')
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm exec vitest run src/mastra/lib/inbox/poll-mailbox.test.ts`
Expected: FAIL — hoy el poller confía en el orden del reader y procesa 'nuevo' primero.

- [ ] **Step 3: Implementar**

En `poll-mailbox.ts`, dentro de `runPollCycle`, reemplazar

```ts
    const messages = await resolved.reader.search(query)
```

por

```ts
    // Del más viejo al más nuevo: un acuse anterior tiene que procesarse antes que la
    // confirmación que lo sigue, o el segundo mail se evalúa contra un step que todavía
    // no avanzó. El orden es un invariante de ESTE motor, no del reader: Gmail lista
    // del más nuevo al más viejo y un reader alternativo no tiene por qué saberlo.
    const found = await resolved.reader.search(query)
    const messages = [...found].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
```

En `gmail-reader.ts`:

1. En `search()`, reemplazar el `return messages.sort(...)` y su comentario por `return messages`.

En `poll-mailbox.ts`, reemplazar el comentario sobre `reader` en `PollDeps` (líneas que empiezan con "search() debe devolver los mails del más viejo al más nuevo...") por:

```ts
    // El orden de lo que devuelve search() no importa: runPollCycle ordena la tanda
    // por receivedAt antes de iterarla.
```

En `gmail-reader.test.ts`, eliminar el test `'ordena los mails del más viejo al más nuevo'` completo (el comportamiento ahora se testea en `poll-mailbox.test.ts`).

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm exec vitest run src/mastra/lib/inbox/ && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox/gmail-reader.ts src/mastra/lib/inbox/gmail-reader.test.ts src/mastra/lib/inbox/poll-mailbox.ts src/mastra/lib/inbox/poll-mailbox.test.ts
git commit -m "refactor: move oldest-first ordering from gmail reader to poll cycle"
```

---

### Task 3: `PROCESSED_LABEL`, `FAILED_LABEL` y `SEARCH_WINDOW` se mudan a `poll-mailbox`

Movimiento puro, sin cambio de comportamiento: las constantes son el protocolo de estado del poller, no un concepto de Gmail. No hay tests nuevos; la suite existente debe seguir verde.

**Files:**
- Modify: `src/mastra/lib/inbox/gmail-reader.ts` (se eliminan las constantes)
- Modify: `src/mastra/lib/inbox/poll-mailbox.ts` (las recibe y exporta)
- Modify: `src/mastra/lib/inbox/retry-failed-mails.ts` (actualiza el import)

**Interfaces:**
- Produces: `PROCESSED_LABEL`, `FAILED_LABEL`, `SEARCH_WINDOW` se exportan desde `./poll-mailbox` con los mismos nombres y valores (`'mostro-processed'`, `'mostro-failed'`, `'newer_than:30d'`). `gmail-reader.ts` deja de exportarlos.

- [ ] **Step 1: Mover las constantes**

En `poll-mailbox.ts`, agregar arriba del type `ResumeResult`:

```ts
// El protocolo de estado del poller sobre la casilla: qué mails ya se procesaron y
// cuáles fallaron. Son política de esta capa, no del reader — el reader pone y saca
// cualquier label que le pidan.
export const PROCESSED_LABEL = 'mostro-processed'
export const FAILED_LABEL = 'mostro-failed'

// La ventana que mira cada ciclo. Vive acá y no incrustada en cada query para que el
// reintento (retry-failed-mails.ts) no pueda quedar desalineado: un mail que se
// destraba fuera de esta ventana no lo levantaría nadie.
export const SEARCH_WINDOW = 'newer_than:30d'
```

En `gmail-reader.ts`:

1. Eliminar las constantes `PROCESSED_LABEL`, `FAILED_LABEL` y `SEARCH_WINDOW` con sus comentarios.
2. Reemplazar el comentario de `addLabel` (el que cita la cuarentena de `poll-mailbox.ts`) por uno que no conozca al consumidor:

```ts
            // Con reintento: etiquetar es la escritura que persiste estado; un fallo
            // transitorio no debe dejarla a medias.
```

En `poll-mailbox.ts`, el import de `./gmail-reader` queda:

```ts
import { gmailReader, type GmailReader, type InboxMessage } from './gmail-reader'
```

En `retry-failed-mails.ts`, reemplazar el import por:

```ts
import { FAILED_LABEL, SEARCH_WINDOW } from './poll-mailbox'
import { gmailReader, type GmailReader } from './gmail-reader'
```

- [ ] **Step 2: Correr la suite y el typecheck**

Run: `pnpm exec vitest run src/mastra/lib/inbox/ && pnpm exec tsc --noEmit`
Expected: PASS — es un movimiento sin cambio de comportamiento; si algo falla es un import que quedó colgado.

- [ ] **Step 3: Commit**

```bash
git add src/mastra/lib/inbox/gmail-reader.ts src/mastra/lib/inbox/poll-mailbox.ts src/mastra/lib/inbox/retry-failed-mails.ts
git commit -m "refactor: move inbox state labels and search window into poll-mailbox"
```

---

### Task 4: `PollConfig` genérico — `query` + `matches` + `onFailure`, y migración de los tres dominios

El motor deja de conocer a sus clientes: `domain` pasa a `string` libre (solo prefija logs), el filtro es del consumidor (`query` server-side opcional + predicado `matches` client-side), y el aviso de fallo entra por config (`onFailure`) en vez del import por defecto de `notify-mail-failure`. Los tres steps de dominio migran en el mismo task porque el cambio de type rompe su compilación.

**Files:**
- Modify: `src/mastra/lib/inbox/poll-mailbox.ts`
- Test: `src/mastra/lib/inbox/poll-mailbox.test.ts`
- Modify: `src/mastra/workflows/diapers-poll/steps/poll-diapers-mailbox.step.ts`
- Modify: `src/mastra/workflows/meds-poll/steps/poll-meds-mailbox.step.ts`
- Modify: `src/mastra/workflows/refunds-poll/steps/poll-refunds-mailbox.step.ts`

**Interfaces:**
- Consumes: `InboxMessage` (con `headers`, Task 1), constantes de labels/ventana en `poll-mailbox` (Task 3), `notifyMailFailure(mastra, { domain, from, subject, reason })` de `@lib/inbox/notify-mail-failure` (sin cambios — su union `'diapers' | 'meds' | 'refunds'` es capa de dominio y se queda ahí).
- Produces:

```ts
export type PollFailure = { from: string; subject: string; reason: string }

export type PollConfig = {
    domain: string
    query?: string
    matches: (message: InboxMessage) => boolean
    onFailure: (mastra: unknown, failure: PollFailure) => Promise<unknown>
    workflowId: string
    getRunId: (yearMonth: string) => string
    steps: Record<string, StepConfig>
}
```

  `PollDeps` pierde `notifyFailure`. `sender` desaparece de `PollConfig`.

- [ ] **Step 1: Actualizar los tests para el contrato nuevo (van a fallar)**

En `poll-mailbox.test.ts`:

1. `buildConfig` pasa a devolver también el mock del aviso:

```ts
function buildConfig(resume = vi.fn().mockResolvedValue({ ok: true })) {
    const onFailure = vi.fn().mockResolvedValue(1)
    return {
        config: {
            domain: 'diapers',
            query: 'from:pedidos@farmacia.test',
            matches: (m: InboxMessage) => m.from === 'pedidos@farmacia.test',
            onFailure,
            workflowId: 'diapersWorkflow',
            getRunId: (ym: string) => `diapers-${ym}`,
            steps: {
                'wait-diapers-confirmation': {
                    schema: confirmSchema,
                    description: 'la confirmación de la fecha de entrega',
                    resume,
                },
            },
        },
        resume,
        onFailure,
    }
}
```

2. En `buildDeps`, eliminar `const notifyFailure = ...` y sacar `notifyFailure` del objeto `deps` y del objeto devuelto.

3. En todos los tests que usaban `notifyFailure` de `buildDeps`, tomar `onFailure` de `buildConfig` en su lugar (mismas aserciones, mismo shape salvo `domain`, que ya no viaja en la failure — quitar `domain: 'diapers'` del `expect.objectContaining` del test `'marca failed y avisa cuando no hay run suspendido en ningún mes'`).

4. El test `'sigue procesando la tanda cuando el aviso de fallo lanza'` reemplaza `deps.notifyFailure = vi.fn().mockRejectedValue(...)` por `config.onFailure = vi.fn().mockRejectedValue(new Error('telegram caído'))` (mutar la config devuelta por `buildConfig` antes de llamar a `runPollCycle`).

5. El test inline de `'relee el step suspendido por cada mail'` (construye su propia config con `domain: 'meds' as const` y `sender`) migra igual: `domain: 'meds'`, sin `sender`, con `matches: (m: InboxMessage) => m.from === 'pedidos@farmacia.test'` y `onFailure: vi.fn().mockResolvedValue(1)`.

6. Agregar dos tests nuevos:

```ts
describe('runPollCycle — filtro del consumidor', () => {
    it('saltea sin etiquetar ni avisar el mail que no matchea el filtro', async () => {
        const { config, resume, onFailure } = buildConfig()
        const { deps, addLabel } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([message({ from: 'otro@remitente.test' })])

        const result = await runPollCycle({}, config, deps)

        expect(resume).not.toHaveBeenCalled()
        expect(addLabel).not.toHaveBeenCalled()
        expect(onFailure).not.toHaveBeenCalled()
        expect(result).toEqual({ processed: 0, failed: 0 })
    })

    it('arma la query con los labels y la ventana aunque no haya query del consumidor', async () => {
        const { config } = buildConfig()
        delete (config as { query?: string }).query
        const { deps, search } = buildDeps()

        await runPollCycle({}, config, deps)

        const query = search.mock.calls[0][0] as string
        expect(query).toBe('-label:mostro-processed -label:mostro-failed newer_than:30d')
    })
})
```

7. Agregar el import del type: `import type { InboxMessage } from './gmail-reader'` ya existe — no hace falta tocarlo.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm exec vitest run src/mastra/lib/inbox/poll-mailbox.test.ts`
Expected: FAIL — errores de tipos/comportamiento: `PollConfig` todavía exige `sender` y no acepta `query`/`matches`/`onFailure`.

- [ ] **Step 3: Implementar el motor**

En `poll-mailbox.ts`:

1. Eliminar el import de `./notify-mail-failure` y reemplazar `PollConfig`/`PollDeps`:

```ts
export type PollFailure = { from: string; subject: string; reason: string }

export type PollConfig = {
    // Identidad del consumidor para los logs. String libre: este motor no conoce
    // los dominios de negocio.
    domain: string
    // Filtro grueso, server-side (query de Gmail): acota lo que se baja de la casilla.
    // Es eficiencia, no semántica — el que decide es matches.
    query?: string
    // Filtro fino, client-side: decide si el mail le incumbe a ESTE consumidor. Un
    // mail que no matchea se saltea sin etiquetar: puede ser de otro consumidor, y
    // el que no es de nadie se descarta solo al salir de SEARCH_WINDOW.
    matches: (message: InboxMessage) => boolean
    // Cómo avisar un fallo de procesamiento. Inyectado: este motor no sabe de
    // suscriptores ni de Telegram.
    onFailure: (mastra: unknown, failure: PollFailure) => Promise<unknown>
    workflowId: string
    getRunId: (yearMonth: string) => string
    steps: Record<string, StepConfig>
}

export type PollDeps = {
    // El orden de lo que devuelve search() no importa: runPollCycle ordena la tanda
    // por receivedAt antes de iterarla.
    reader: GmailReader
    extract: Extract
    readSuspendedStep: (mastra: unknown, workflowId: string, runId: string) => Promise<string | null>
}
```

2. En `defaultDeps`, eliminar la línea `notifyFailure: notifyMailFailure,`.

3. En `runPollCycle`, armar la query componiendo:

```ts
    const query = [config.query, `-label:${PROCESSED_LABEL}`, `-label:${FAILED_LABEL}`, SEARCH_WINDOW]
        .filter(Boolean)
        .join(' ')
```

4. En el helper `fail`, reemplazar la llamada `resolved.notifyFailure(mastra, { domain: config.domain, from..., subject..., reason })` por:

```ts
            await config.onFailure(mastra, {
                from: message.from,
                subject: message.subject,
                reason,
            })
```

   (el try/catch y los `console.error` con prefijo `[poll-${config.domain}]` quedan igual).

5. Al principio del loop `for (const message of messages)`, antes de `resolveOpenRun`, agregar:

```ts
        // "No es mío" no es un fallo: otro consumidor puede reclamarlo en su ciclo.
        if (!config.matches(message)) continue
```

- [ ] **Step 4: Migrar los tres steps de dominio**

Mismo patrón en los tres archivos; cambian solo el literal de dominio y la variable de config. En cada uno, agregar el import:

```ts
import { notifyMailFailure } from '@lib/inbox/notify-mail-failure'
```

`poll-diapers-mailbox.step.ts` — reemplazar `domain: 'diapers',` y la línea `sender: ...` (con su comentario) por:

```ts
    domain: 'diapers',
    // El proveedor responde desde la misma casilla a la que le escribimos.
    query: `from:${appConfig.DIAPERS_EMAIL_TO}`,
    // El reader normaliza from a minúsculas; la query de Gmail era case-insensitive
    // y el toLowerCase preserva esa tolerancia.
    matches: message => message.from === appConfig.DIAPERS_EMAIL_TO.toLowerCase(),
    onFailure: (mastra, failure) => notifyMailFailure(mastra, { domain: 'diapers', ...failure }),
```

`poll-meds-mailbox.step.ts` — reemplazar `domain: 'meds',` y `sender: appConfig.MEDS_EMAIL_TO,` por:

```ts
    domain: 'meds',
    query: `from:${appConfig.MEDS_EMAIL_TO}`,
    matches: message => message.from === appConfig.MEDS_EMAIL_TO.toLowerCase(),
    onFailure: (mastra, failure) => notifyMailFailure(mastra, { domain: 'meds', ...failure }),
```

`poll-refunds-mailbox.step.ts` — reemplazar `domain: 'refunds',` y `sender: appConfig.REFUNDS_EMAIL_TO,` por:

```ts
    domain: 'refunds',
    query: `from:${appConfig.REFUNDS_EMAIL_TO}`,
    matches: message => message.from === appConfig.REFUNDS_EMAIL_TO.toLowerCase(),
    onFailure: (mastra, failure) => notifyMailFailure(mastra, { domain: 'refunds', ...failure }),
```

`poll-step.ts` y `notify-mail-failure.ts` no se tocan.

- [ ] **Step 5: Correr la suite completa y el typecheck**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: PASS completo — la suite entera, no solo inbox, porque los steps de dominio cambiaron.

- [ ] **Step 6: Commit**

```bash
git add src/mastra/lib/inbox/poll-mailbox.ts src/mastra/lib/inbox/poll-mailbox.test.ts src/mastra/workflows/diapers-poll/steps/poll-diapers-mailbox.step.ts src/mastra/workflows/meds-poll/steps/poll-meds-mailbox.step.ts src/mastra/workflows/refunds-poll/steps/poll-refunds-mailbox.step.ts
git commit -m "refactor: generalize poll config with query, matches predicate and onFailure callback"
```
