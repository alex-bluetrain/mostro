# Inbox Classifier (etapa 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `InboxClassifier`, una clase aislada y genérica que lee mails de Gmail, limpia su cuerpo, los clasifica con un LLM contra un conjunto de resultados configurables, y aplica el label correspondiente en la casilla — sin ningún disparador todavía (eso es la etapa 2).

**Architecture:** Todo vive en `src/mastra/lib/inbox-classifier/` (nuevo, sin relación de código con `src/mastra/lib/inbox/` existente) más un único agente Mastra en `src/mastra/agents/inbox-classifier-agent.ts`. La clase `InboxClassifier` recibe su config por constructor, arma su propio cliente de Gmail (`@googleapis/gmail`, mismas env vars que `gmail-client.ts` vía `appConfig`, pero sin importarlo), traduce una descripción en lenguaje natural a una query real de Gmail una sola vez en `init()`, y en `run()` lista, lee, limpia (`cheerio`/`email-reply-parser`), clasifica y etiqueta cada mail, de más viejo a más nuevo, secuencial, sin que un fallo en un mail corte el resto.

**Tech Stack:** TypeScript, Vitest, `@googleapis/gmail`, Mastra `Agent`, `zod`, `cheerio`, `email-reply-parser`.

## Global Constraints

- No se modifica ningún archivo de `src/mastra/lib/inbox/` (motor de polling existente).
- Comillas simples y sin `;` en todo el código nuevo (`lib/inbox-classifier/`, `agents/inbox-classifier-agent.ts`). `index.ts` es legacy (comillas dobles + `;`): al editarlo, mantené su estilo existente.
- Sin helpers compartidos innecesarios: cada función que necesita el agente lo obtiene con `mastra.getAgent('inboxClassifier')` inline, sin envolver esa llamada.
- Todo secuencial en `run()`: nada de `Promise.all` sobre los mails. Un fallo en un mail nunca corta el loop — se loguea con `console.warn` y se sigue con el próximo id.
- Esta etapa no incluye disparador (cron/tool/workflow) ni notificación real de fallos (placeholder `console.warn` + comentario `TODO`).
- Spec de referencia: `docs/superpowers/specs/2026-07-29-inbox-classifier-design.md`.

---

### Task 1: Instalar dependencias

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (generados por pnpm, no se editan a mano)

**Interfaces:**
- Produces: `cheerio`, `email-reply-parser` (con sus `@types/email-reply-parser`) disponibles para importar en el resto de las tareas.

- [ ] **Step 1: Instalar las dependencias de runtime**

Run: `pnpm add cheerio email-reply-parser`

- [ ] **Step 2: Instalar los tipos de email-reply-parser (cheerio ya trae sus propios tipos)**

Run: `pnpm add -D @types/email-reply-parser`

- [ ] **Step 3: Verificar que quedaron en package.json**

Run: `grep -E "cheerio|email-reply-parser" package.json`
Expected: aparecen las tres entradas (`cheerio`, `email-reply-parser`, `@types/email-reply-parser`) en `dependencies`/`devDependencies`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add cheerio and email-reply-parser dependencies"
```

---

### Task 2: `strip-mail-body.ts` — limpieza del cuerpo del mail

**Files:**
- Create: `src/mastra/lib/inbox-classifier/strip-mail-body.ts`
- Test: `src/mastra/lib/inbox-classifier/strip-mail-body.test.ts`

**Interfaces:**
- Produces: `export function stripMailBody(payload: unknown): string` — usado por `InboxClassifier.run()` en la Task 4/5.

- [ ] **Step 1: Escribir los tests (fallando)**

Crear `src/mastra/lib/inbox-classifier/strip-mail-body.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { stripMailBody } from './strip-mail-body'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

describe('stripMailBody', () => {
    it('devuelve el texto plano tal cual cuando no hay citas', () => {
        const payload = {
            mimeType: 'text/plain',
            body: { data: encode('Confirmamos la entrega para el 11/03.') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('corta el hilo citado del texto plano', () => {
        const payload = {
            mimeType: 'text/plain',
            body: { data: encode('Confirmamos la entrega para el 11/03.\n\n> Cuando entregan?\n> Gracias.') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('extrae el texto de un mail solo-html con cheerio', () => {
        const payload = {
            mimeType: 'text/html',
            body: { data: encode('<html><body><p>Confirmamos la entrega para el <b>11/03</b>.</p></body></html>') },
        }

        expect(stripMailBody(payload)).toBe('Confirmamos la entrega para el 11/03.')
    })

    it('prefiere text/plain sobre text/html cuando ambos están presentes', () => {
        const payload = {
            mimeType: 'multipart/alternative',
            parts: [
                { mimeType: 'text/plain', body: { data: encode('versión en texto plano') } },
                { mimeType: 'text/html', body: { data: encode('<p>versión en html</p>') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('versión en texto plano')
    })

    it('encuentra la parte plana anidada dentro de multipart/mixed > multipart/alternative', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            parts: [
                {
                    mimeType: 'multipart/alternative',
                    parts: [
                        { mimeType: 'text/plain', body: { data: encode('contenido anidado') } },
                    ],
                },
                { mimeType: 'application/pdf', body: { data: encode('binario-irrelevante') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('contenido anidado')
    })

    it('devuelve string vacío cuando no hay ninguna parte de texto', () => {
        const payload = {
            mimeType: 'multipart/mixed',
            parts: [
                { mimeType: 'application/pdf', body: { data: encode('binario') } },
            ],
        }

        expect(stripMailBody(payload)).toBe('')
    })

    it('devuelve string vacío con payload undefined', () => {
        expect(stripMailBody(undefined)).toBe('')
    })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm test strip-mail-body`
Expected: FAIL — `Cannot find module './strip-mail-body'` (el archivo todavía no existe).

- [ ] **Step 3: Implementar `strip-mail-body.ts`**

Crear `src/mastra/lib/inbox-classifier/strip-mail-body.ts`:

```ts
import * as cheerio from 'cheerio'
import EmailReplyParser from 'email-reply-parser'

type Payload = {
    mimeType?: string | null
    body?: { data?: string | null } | null
    parts?: Payload[]
}

export function stripMailBody(payload: unknown): string {
    const root = payload as Payload | undefined

    const plain = findPart(root, 'text/plain')
    if (plain) return new EmailReplyParser().read(decode(plain)).getVisibleText()

    const html = findPart(root, 'text/html')
    if (html) return cheerio.load(decode(html)).text()

    return ''
}

function findPart(payload: Payload | undefined, mimeType: string): Payload | null {
    if (!payload) return null
    if (payload.mimeType === mimeType && payload.body?.data) return payload
    for (const part of payload.parts ?? []) {
        const found = findPart(part, mimeType)
        if (found) return found
    }
    return null
}

function decode(part: Payload): string {
    return Buffer.from(part.body?.data ?? '', 'base64url').toString('utf-8')
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test strip-mail-body`
Expected: PASS — los 7 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox-classifier/strip-mail-body.ts src/mastra/lib/inbox-classifier/strip-mail-body.test.ts
git commit -m "feat: add strip-mail-body for the inbox classifier"
```

---

### Task 3: `inbox-classifier-agent.ts` — agente Mastra + registro

**Files:**
- Create: `src/mastra/agents/inbox-classifier-agent.ts`
- Modify: `src/mastra/index.ts:26` (import), `src/mastra/index.ts:63` (mapa `agents`)

**Interfaces:**
- Produces: `export const inboxClassifierAgent` — accedido en runtime como `mastra.getAgent('inboxClassifier')` (Task 4).

- [ ] **Step 1: Crear el agente**

Crear `src/mastra/agents/inbox-classifier-agent.ts`:

```ts
import { Agent } from '@mastra/core/agent'

// Un solo agente para dos tareas (traducir la query, clasificar el mail): ambas son
// lectura de lenguaje natural sin tools ni memoria, así que no justifican dos agentes
// separados. Quien llama arma el prompt según la tarea.
export const inboxClassifierAgent = new Agent({
    id: 'inbox-classifier-agent',
    name: 'Inbox Classifier',
    description: 'Traduce descripciones en lenguaje natural a queries de Gmail y clasifica mails contra un conjunto de posibles resultados.',
    instructions: `Cumplís dos tareas posibles, según lo que te pidan en el prompt:

1. Traducir una descripción en lenguaje natural a una query de búsqueda de Gmail (sintaxis de users.messages.list: from:, newer_than:, label:, -label:, subject:, etc.). Devolvé solo la query, sin explicación.

2. Clasificar un mail contra una lista de resultados posibles, cada uno con su descripción. Elegí exactamente uno, el que mejor describe el mail. Si ninguno de los específicos aplica, usá el que la lista describe como el resultado general/catch-all.

Respondé siempre en español cuando el campo sea texto libre.`,
    model: 'openrouter/deepseek/deepseek-v4-flash',
})
```

- [ ] **Step 2: Registrar el agente en `index.ts`**

En `src/mastra/index.ts:26`, agregar el import después de la línea de `mailExtractorAgent` (mismo bloque de imports, respetando el estilo legacy `;` del archivo):

```ts
import { mailExtractorAgent } from './lib/inbox/mail-extractor';
import { inboxClassifierAgent } from './agents/inbox-classifier-agent';
```

En `src/mastra/index.ts:63`, agregar `inboxClassifier: inboxClassifierAgent` al mapa `agents`:

```ts
agents: { weatherAgent, diapersAgent, medsAgent, refundsAgent, mostroSupervisor, mailExtractor: mailExtractorAgent, inboxClassifier: inboxClassifierAgent },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores (memoria del proyecto: `pnpm build` puede fallar por lock EBUSY si hay dev corriendo — usar `tsc --noEmit` para typecheck).

- [ ] **Step 4: Commit**

```bash
git add src/mastra/agents/inbox-classifier-agent.ts src/mastra/index.ts
git commit -m "feat: add and register the inbox classifier agent"
```

---

### Task 4: `InboxClassifier` — constructor, `init()`, `run()` felices

**Files:**
- Create: `src/mastra/lib/inbox-classifier/inbox-classifier.ts`
- Test: `src/mastra/lib/inbox-classifier/inbox-classifier.test.ts`

**Interfaces:**
- Consumes: `stripMailBody(payload: unknown): string` (Task 2). Agente registrado como `inboxClassifier` (Task 3), invocado en runtime vía `mastra.getAgent('inboxClassifier').generate(prompt, opts)`.
- Produces: `export type ClassifierOutcome = { label: string; description: string }`, `export type InboxClassifierConfig = { queryDescription: string; outcomes: ClassifierOutcome[] }`, `export class InboxClassifier` con `constructor(mastra: unknown, config: InboxClassifierConfig, gmailClientOverride?: GmailClient)`, `async init(): Promise<void>`, `async run(): Promise<void>`.

- [ ] **Step 1: Escribir el primer test (camino feliz, un solo mail)**

Crear `src/mastra/lib/inbox-classifier/inbox-classifier.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { InboxClassifier, type InboxClassifierConfig } from './inbox-classifier'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function buildGmail(overrides: Record<string, unknown> = {}) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({
        data: {
            id: 'm1',
            payload: { mimeType: 'text/plain', body: { data: encode('Confirmamos la entrega.') } },
        },
    })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({ data: { labels: [{ id: 'L1', name: 'clasificado-pedido' }] } })
    const labelsCreate = vi.fn().mockResolvedValue({ data: { id: 'L2' } })

    return {
        gmail: {
            users: {
                messages: { list, get, modify },
                labels: { list: labelsList, create: labelsCreate },
            },
            ...overrides,
        } as never,
        list, get, modify, labelsList, labelsCreate,
    }
}

function buildMastra(responses: unknown[]) {
    const generate = vi.fn()
    responses.forEach(object => generate.mockResolvedValueOnce({ object }))
    const mastra = { getAgent: vi.fn().mockReturnValue({ generate }) }
    return { mastra, generate }
}

const config: InboxClassifierConfig = {
    queryDescription: 'mails de proveedores de farmacia de los últimos 30 días',
    outcomes: [
        { label: 'clasificado-pedido', description: 'confirma una entrega' },
        { label: 'clasificado-otro', description: 'catch-all: cualquier otra cosa' },
    ],
}

describe('InboxClassifier', () => {
    it('traduce la query, lista, lee, clasifica y etiqueta un solo mail', async () => {
        const { gmail, list, get, modify, labelsList, labelsCreate } = buildGmail()
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-pedido' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(list).toHaveBeenCalledWith({ userId: 'me', q: 'from:farmacia.test newer_than:30d' })
        expect(get).toHaveBeenCalledWith({ userId: 'me', id: 'm1', format: 'full' })
        expect(generate).toHaveBeenNthCalledWith(2, expect.stringContaining('Confirmamos la entrega.'), expect.anything())
        expect(labelsCreate).not.toHaveBeenCalled()
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        })
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test inbox-classifier`
Expected: FAIL — `Cannot find module './inbox-classifier'`.

- [ ] **Step 3: Implementar `InboxClassifier` (constructor, `init`, `run`, `resolveLabelId`, `applyLabel`)**

Crear `src/mastra/lib/inbox-classifier/inbox-classifier.ts`:

```ts
import { auth, gmail } from '@googleapis/gmail'
import { z } from 'zod'
import { appConfig } from '@config/app.config'
import { stripMailBody } from './strip-mail-body'

export type GmailClient = ReturnType<typeof gmail>

export type ClassifierOutcome = {
    label: string
    description: string
}

export type InboxClassifierConfig = {
    queryDescription: string
    outcomes: ClassifierOutcome[]
}

export class InboxClassifier {
    private query: string | undefined
    private readonly gmail: GmailClient

    constructor(
        private readonly mastra: unknown,
        private readonly config: InboxClassifierConfig,
        gmailClientOverride?: GmailClient,
    ) {
        if (gmailClientOverride) {
            this.gmail = gmailClientOverride
        } else {
            const oauth2 = new auth.OAuth2(appConfig.GMAIL_MAILER_CLIENT_ID, appConfig.GMAIL_MAILER_CLIENT_SECRET)
            oauth2.setCredentials({ refresh_token: appConfig.GMAIL_MAILER_REFRESH_TOKEN })
            this.gmail = gmail({ version: 'v1', auth: oauth2 })
        }
    }

    async init(): Promise<void> {
        this.query = await translateQuery(this.mastra, this.config.queryDescription)
    }

    async run(): Promise<void> {
        if (!this.query) throw new Error('InboxClassifier: llamá a init() antes de run()')

        const { data } = await this.gmail.users.messages.list({ userId: 'me', q: this.query })
        const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id)).reverse()

        for (const id of ids) {
            try {
                const { data: raw } = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' })
                const text = stripMailBody(raw.payload)
                const label = await classify(this.mastra, text, this.config.outcomes)
                await this.applyLabel(id, label)
            } catch (error) {
                console.warn(`[inbox-classifier] no pude clasificar/etiquetar ${id}`, error)
                // TODO: notificar el fallo (placeholder para etapa futura)
            }
        }
    }

    private async resolveLabelId(label: string): Promise<string> {
        const { data } = await this.gmail.users.labels.list({ userId: 'me' })
        const existing = data.labels?.find(l => l.name === label)
        if (existing?.id) return existing.id

        const created = await this.gmail.users.labels.create({
            userId: 'me',
            requestBody: { name: label, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        if (!created.data.id) throw new Error(`Gmail no devolvió id para el label "${label}"`)
        return created.data.id
    }

    private async applyLabel(messageId: string, label: string): Promise<void> {
        const labelId = await this.resolveLabelId(label)
        await this.gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: { addLabelIds: [labelId] },
        })
    }
}

async function translateQuery(mastra: unknown, queryDescription: string): Promise<string> {
    const agent = (mastra as { getAgent: (id: string) => { generate: (prompt: string, opts: unknown) => Promise<{ object?: unknown }> } }).getAgent('inboxClassifier')
    const schema = z.object({ query: z.string() })
    const prompt = `Convertí esta descripción a una query de búsqueda de Gmail (sintaxis de users.messages.list: from:, newer_than:, label:, -label:, etc.).

Descripción: ${queryDescription}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).query
}

async function classify(mastra: unknown, text: string, outcomes: ClassifierOutcome[]): Promise<string> {
    const agent = (mastra as { getAgent: (id: string) => { generate: (prompt: string, opts: unknown) => Promise<{ object?: unknown }> } }).getAgent('inboxClassifier')
    const labels = outcomes.map(o => o.label) as [string, ...string[]]
    const schema = z.object({ label: z.enum(labels) })
    const prompt = `Clasificá este mail contra los siguientes resultados posibles. Elegí exactamente uno.

${outcomes.map(o => `- ${o.label}: ${o.description}`).join('\n')}

Mail:
${text}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).label
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test inbox-classifier`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox-classifier/inbox-classifier.ts src/mastra/lib/inbox-classifier/inbox-classifier.test.ts
git commit -m "feat: add InboxClassifier happy path"
```

---

### Task 5: `InboxClassifier` — creación de label, orden, y aislamiento de fallos

**Files:**
- Modify: `src/mastra/lib/inbox-classifier/inbox-classifier.test.ts` (agrega tests)
- Modify: `src/mastra/lib/inbox-classifier/inbox-classifier.ts` (ya cubre estos casos desde la Task 4; esta tarea solo verifica y, si hiciera falta, ajusta)

**Interfaces:**
- Consumes: lo mismo que la Task 4, sin cambios de firma.

- [ ] **Step 1: Agregar los tests de creación de label, orden y aislamiento de fallos**

Agregar al final de `describe('InboxClassifier', ...)` en `src/mastra/lib/inbox-classifier/inbox-classifier.test.ts`:

```ts
    it('crea el label cuando no existe todavía', async () => {
        const { gmail, labelsList, labelsCreate, modify } = buildGmail()
        labelsList.mockResolvedValue({ data: { labels: [] } })
        const { mastra } = buildMastra([
            { query: 'from:farmacia.test' },
            { label: 'clasificado-pedido' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(labelsCreate).toHaveBeenCalledWith({
            userId: 'me',
            requestBody: { name: 'clasificado-pedido', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        })
    })

    it('procesa los mails de más viejo a más nuevo (list devuelve más nuevo primero)', async () => {
        const { gmail, list, get } = buildGmail()
        list.mockResolvedValue({ data: { messages: [{ id: 'nuevo' }, { id: 'viejo' }] } })
        get.mockImplementation(async ({ id }: { id: string }) => ({
            data: { id, payload: { mimeType: 'text/plain', body: { data: encode(`contenido de ${id}`) } } },
        }))
        const { mastra, generate } = buildMastra([
            { query: 'q' },
            { label: 'clasificado-pedido' },
            { label: 'clasificado-pedido' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(generate.mock.calls[1][0]).toContain('contenido de viejo')
        expect(generate.mock.calls[2][0]).toContain('contenido de nuevo')
    })

    it('un fallo en un mail no corta el procesamiento del resto', async () => {
        const { gmail, get, modify } = buildGmail()
        get.mockRejectedValueOnce(new Error('Gmail caído'))
        const { mastra } = buildMastra([{ query: 'q' }])
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('m1'), expect.any(Error))
        expect(modify).not.toHaveBeenCalled()
        warn.mockRestore()
    })

    it('lanza si se llama run() antes de init()', async () => {
        const { gmail } = buildGmail()
        const { mastra } = buildMastra([])

        const classifier = new InboxClassifier(mastra as never, config, gmail)

        await expect(classifier.run()).rejects.toThrow('llamá a init()')
    })
```

- [ ] **Step 2: Correr los tests y verificar que pasan (o identificar qué falla)**

Run: `pnpm test inbox-classifier`
Expected: PASS en los cuatro tests nuevos. La implementación de la Task 4 ya cubre estos casos (creación de label vía `resolveLabelId`, orden vía `.reverse()`, aislamiento de fallos vía `try/catch` + `console.warn`, guard de `init()` vía el `throw` al inicio de `run()`) — si alguno falla, ajustar `inbox-classifier.ts` para que se cumpla, sin cambiar las firmas públicas.

- [ ] **Step 3: Typecheck completo**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr toda la suite de tests del módulo**

Run: `pnpm test inbox-classifier strip-mail-body`
Expected: todos los tests en verde (12 tests entre los dos archivos: 7 en `strip-mail-body.test.ts`, 5 en `inbox-classifier.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox-classifier/inbox-classifier.test.ts
git commit -m "test: cover label creation, ordering and failure isolation in InboxClassifier"
```

---

## Fuera de alcance de este plan

- Disparador (cron/tool/workflow) que invoque `new InboxClassifier(...).init()` + `.run()`.
- Notificación real de fallos (queda el `console.warn` + `TODO`).
- Cache de label→id entre llamadas de `resolveLabelId` (el método ya está aislado como para agregarlo después sin tocar su firma).
