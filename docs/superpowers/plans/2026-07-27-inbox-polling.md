# Polling de la casilla — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las seis rutas HTTP de resume por tres workflows de polling que leen la casilla de Gmail, extraen los datos del mail y reanudan el workflow del dominio.

**Architecture:** Tres workflows independientes (uno por dominio) con `schedule` nativo de Mastra, sobre un helper compartido que ejecuta el ciclo. El ruteo lo determina el step suspendido del run, no el LLM: el poller lee `getSuspendedStep()` antes de llamar al modelo y le hace una pregunta cerrada con el schema de ese step. Los mails procesados y fallidos se marcan con labels de Gmail.

**Tech Stack:** Mastra (`@mastra/core` 1.48), `@googleapis/gmail` 17, Zod 4, Vitest 4, MongoDB/Mongoose. Package manager: **pnpm**.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-07-27-inbox-polling-design.md`
- Usar **pnpm**, nunca npm. Tests: `pnpm test`. Typecheck: `pnpm run typecheck`.
- **No correr `pnpm build`**: falla con `EBUSY` sobre `mastra.duckdb` si hay un `dev` corriendo. Para verificar tipos usar `pnpm run typecheck`.
- Registrar todo workflow, agente y tool nuevo en `src/mastra/index.ts`. Sin eso el scheduler no los ve al arrancar.
- Indentación: 4 espacios, sin punto y coma final, comillas simples (seguir el estilo de `src/mastra/lib/diapers-run.ts`).
- Comentarios y specs en español. Mensajes de commit en inglés.
- Modelo para agentes nuevos: `'openrouter/deepseek/deepseek-v4-flash'` (el mismo que usan los agentes existentes).
- Los tests van al lado del código, como `<archivo>.test.ts`.
- Toda variable de entorno nueva se agrega a `src/mastra/config/app.config.ts` **y** a `tests/setup-env.ts`.

## Decisiones fijadas durante la planificación

**No se agregan variables de entorno nuevas para los remitentes.** El spec proponía
`DIAPERS_SENDER` / `MEDS_SENDER` / `REFUNDS_SENDER`, pero ya existen `DIAPERS_EMAIL_TO`,
`MEDS_EMAIL_TO` y `REFUNDS_EMAIL_TO` — las casillas a las que mostro escribe, que son las
mismas que responden. Se reutilizan. Si algún día un proveedor responde desde otra
dirección, se agrega la variable ahí.

**Las funciones de resume no tienen firma uniforme.** `acknowledgeMedsOrder(mastra, yearMonth)`
y `acknowledgeRefund(mastra, yearMonth)` toman un string; las otras cuatro toman un objeto con
`yearMonth` adentro. El config de cada step las normaliza con un adapter
`(mastra, data, yearMonth) => Promise<...>` en lugar de tocar las funciones existentes.

## File Structure

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `src/mastra/lib/mailer/gmail-client.ts` | Cliente OAuth de Gmail, compartido por mailer y reader |
| `src/mastra/lib/inbox/gmail-reader.ts` | Buscar, leer y etiquetar mails |
| `src/mastra/lib/inbox/mail-extractor.ts` | Agente de extracción + wrapper `matches`/`reason`/`data` |
| `src/mastra/lib/inbox/notify-mail-failure.ts` | Aviso por Telegram a los suscriptores del dominio |
| `src/mastra/lib/inbox/poll-mailbox.ts` | El ciclo: leer → extraer → reanudar → etiquetar |
| `src/mastra/lib/inbox/retry-failed-mails.ts` | Devolver mails fallidos a la cola |
| `src/mastra/workflows/diapers/diapers-poll.workflow.ts` | Config + schedule de diapers |
| `src/mastra/workflows/meds/meds-poll.workflow.ts` | Config + schedule de meds |
| `src/mastra/workflows/refunds/refunds-poll.workflow.ts` | Config + schedule de refunds |
| `src/mastra/tools/diapers-retry-failed-mail-tool.ts` | Tool de reintento (admin) |
| `src/mastra/tools/meds-retry-failed-mail-tool.ts` | Tool de reintento (admin) |
| `src/mastra/tools/refunds-retry-failed-mail-tool.ts` | Tool de reintento (admin) |

**Modificar:** `src/mastra/lib/mailer/gmail-mailer.ts`, `src/mastra/lib/date-scope.ts`,
`src/mastra/index.ts`, `scripts/gmail-authorize.mjs`, los tres agentes de dominio.

**Borrar:** las seis rutas `src/mastra/routes/webhook-*.route.ts` y sus tests.

---

### Task 1: Cliente de Gmail compartido y scope de lectura

El mailer instancia su propio cliente OAuth. El reader necesita el mismo. Se extrae a un
módulo, y se amplía el scope para poder leer y etiquetar.

**Files:**
- Create: `src/mastra/lib/mailer/gmail-client.ts`
- Modify: `src/mastra/lib/mailer/gmail-mailer.ts:1-18`
- Modify: `scripts/gmail-authorize.mjs:15,32`

**Interfaces:**
- Produces: `getGmailClient(): ReturnType<typeof gmail>` — cliente autenticado, memoizado.

- [ ] **Step 1: Crear el módulo del cliente**

`src/mastra/lib/mailer/gmail-client.ts`:

```ts
import { auth, gmail } from '@googleapis/gmail'
import { appConfig } from '../../config/app.config'

let client: ReturnType<typeof gmail> | undefined

// Compartido entre el mailer (enviar) y el reader (leer y etiquetar): un solo
// refresh token, un solo cliente. El SDK renueva el access token solo.
export function getGmailClient() {
    if (!client) {
        const oauth2 = new auth.OAuth2(appConfig.GMAIL_MAILER_CLIENT_ID, appConfig.GMAIL_MAILER_CLIENT_SECRET)
        oauth2.setCredentials({ refresh_token: appConfig.GMAIL_MAILER_REFRESH_TOKEN })
        client = gmail({ version: 'v1', auth: oauth2 })
    }
    return client
}
```

- [ ] **Step 2: Usarlo desde el mailer**

En `src/mastra/lib/mailer/gmail-mailer.ts`, borrar el import de `auth`, la variable `client`
y la función `getClient()`. Reemplazar el import y la llamada:

```ts
import { appConfig } from '../../config/app.config'
import { buildRawMessage } from './mime'
import { getGmailClient } from './gmail-client'
```

Y en `sendEmail`, cambiar `getClient()` por `getGmailClient()`.

- [ ] **Step 3: Verificar que los tests del mailer siguen pasando**

Run: `pnpm test src/mastra/lib/mailer/`
Expected: PASS — la refactorización no cambia comportamiento.

- [ ] **Step 4: Ampliar el scope del script de autorización**

En `scripts/gmail-authorize.mjs`, reemplazar la línea 15:

```js
// modify habilita leer y etiquetar además de enviar, que es lo que necesita el poller.
// Gmail no ofrece scopes acotados por label: esto alcanza toda la casilla, y la contención
// queda en el código (query fijo por remitente, funciones de resume predefinidas).
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
]
```

Y en la línea 32, `scope: [SCOPE]` pasa a `scope: SCOPES`.

- [ ] **Step 5: Typecheck y commit**

Run: `pnpm run typecheck`
Expected: sin errores.

```bash
git add src/mastra/lib/mailer/gmail-client.ts src/mastra/lib/mailer/gmail-mailer.ts scripts/gmail-authorize.mjs
git commit -m "refactor: share the gmail client between mailer and reader"
```

---

### Task 2: Helpers de mes

Un pedido abierto a fin de mes se confirma el mes siguiente. El poller necesita derivar el
mes de un mail y retroceder uno.

**Files:**
- Modify: `src/mastra/lib/date-scope.ts`
- Test: `src/mastra/lib/date-scope.test.ts`

**Interfaces:**
- Produces: `yearMonthOf(date: Date): string`, `previousYearMonth(yearMonth: string): string`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/mastra/lib/date-scope.test.ts`:

```ts
import { yearMonthOf, previousYearMonth } from './date-scope'

describe('yearMonthOf', () => {
    it('deriva el YYYY-MM de una fecha', () => {
        expect(yearMonthOf(new Date(2026, 6, 30))).toBe('2026-07')
    })

    it('padea el mes a dos dígitos', () => {
        expect(yearMonthOf(new Date(2026, 0, 5))).toBe('2026-01')
    })
})

describe('previousYearMonth', () => {
    it('retrocede un mes dentro del mismo año', () => {
        expect(previousYearMonth('2026-08')).toBe('2026-07')
    })

    it('cruza el cambio de año', () => {
        expect(previousYearMonth('2026-01')).toBe('2025-12')
    })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test src/mastra/lib/date-scope.test.ts`
Expected: FAIL — `yearMonthOf is not a function`.

- [ ] **Step 3: Implementar**

Agregar a `src/mastra/lib/date-scope.ts`:

```ts
// El mail de respuesta no siempre cae en el mismo mes que el pedido: uno abierto el 30 de
// julio se puede confirmar el 2 de agosto. El poller usa estas dos para probar el mes del
// mail y, si ahí no hay run suspendido, el anterior.
export function yearMonthOf(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}

export function previousYearMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number)
    return month === 1
        ? `${year - 1}-12`
        : `${year}-${String(month - 1).padStart(2, '0')}`
}
```

- [ ] **Step 4: Correr los tests**

Run: `pnpm test src/mastra/lib/date-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/date-scope.ts src/mastra/lib/date-scope.test.ts
git commit -m "feat: add month helpers for resolving a mail to its order month"
```

---

### Task 3: Lector de Gmail

Envuelve la API de Gmail en cuatro operaciones. El body de un mail puede venir en el
payload directo o dentro de `parts`, siempre en base64url.

**Files:**
- Create: `src/mastra/lib/inbox/gmail-reader.ts`
- Test: `src/mastra/lib/inbox/gmail-reader.test.ts`

**Interfaces:**
- Consumes: `getGmailClient()` de Task 1.
- Produces:
  - `type InboxMessage = { id: string; from: string; subject: string; body: string; receivedAt: Date }`
  - `type GmailReader = { search(query: string): Promise<InboxMessage[]>; addLabel(id: string, label: string): Promise<void>; removeLabel(id: string, label: string): Promise<void> }`
  - `createGmailReader(client?): GmailReader`
  - `gmailReader: GmailReader` (instancia por defecto)
  - `PROCESSED_LABEL = 'mostro-processed'`, `FAILED_LABEL = 'mostro-failed'`

- [ ] **Step 1: Escribir los tests que fallan**

`src/mastra/lib/inbox/gmail-reader.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createGmailReader } from './gmail-reader'

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function buildClient(overrides: Record<string, unknown> = {}) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({
        data: {
            id: 'm1',
            internalDate: '1785000000000',
            payload: {
                headers: [
                    { name: 'From', value: 'Farmacia <pedidos@farmacia.test>' },
                    { name: 'Subject', value: 'Confirmación de pedido' },
                ],
                mimeType: 'text/plain',
                body: { data: encode('Entregamos el 11/03.') },
            },
        },
    })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({ data: { labels: [{ id: 'L1', name: 'mostro-processed' }] } })
    const labelsCreate = vi.fn().mockResolvedValue({ data: { id: 'L2' } })

    return {
        client: {
            users: {
                messages: { list, get, modify },
                labels: { list: labelsList, create: labelsCreate },
            },
            ...overrides,
        } as never,
        list, get, modify, labelsList, labelsCreate,
    }
}

describe('createGmailReader().search', () => {
    it('devuelve remitente, asunto y cuerpo decodificado', async () => {
        const { client } = buildClient()
        const reader = createGmailReader(client)

        const messages = await reader.search('from:pedidos@farmacia.test')

        expect(messages).toEqual([{
            id: 'm1',
            from: 'pedidos@farmacia.test',
            subject: 'Confirmación de pedido',
            body: 'Entregamos el 11/03.',
            receivedAt: new Date(1785000000000),
        }])
    })

    it('devuelve lista vacía cuando no hay mails', async () => {
        const { client, list } = buildClient()
        list.mockResolvedValue({ data: {} })

        const messages = await createGmailReader(client).search('from:nadie@test')

        expect(messages).toEqual([])
    })

    it('extrae el cuerpo de la parte text/plain cuando el mail es multipart', async () => {
        const { client, get } = buildClient()
        get.mockResolvedValue({
            data: {
                id: 'm1',
                internalDate: '1785000000000',
                payload: {
                    headers: [{ name: 'From', value: 'a@b.test' }, { name: 'Subject', value: 'x' }],
                    mimeType: 'multipart/alternative',
                    parts: [
                        { mimeType: 'text/html', body: { data: encode('<p>hola</p>') } },
                        { mimeType: 'text/plain', body: { data: encode('hola') } },
                    ],
                },
            },
        })

        const [message] = await createGmailReader(client).search('q')

        expect(message.body).toBe('hola')
    })

    it('ordena los mails del más viejo al más nuevo', async () => {
        const { client, list, get } = buildClient()
        list.mockResolvedValue({ data: { messages: [{ id: 'nuevo' }, { id: 'viejo' }] } })
        get.mockImplementation(async ({ id }: { id: string }) => ({
            data: {
                id,
                internalDate: id === 'viejo' ? '1000' : '2000',
                payload: {
                    headers: [{ name: 'From', value: 'a@b.test' }, { name: 'Subject', value: 's' }],
                    mimeType: 'text/plain',
                    body: { data: encode('x') },
                },
            },
        }))

        const messages = await createGmailReader(client).search('q')

        expect(messages.map(m => m.id)).toEqual(['viejo', 'nuevo'])
    })
})

describe('createGmailReader().addLabel', () => {
    it('reutiliza el label existente', async () => {
        const { client, modify, labelsCreate } = buildClient()

        await createGmailReader(client).addLabel('m1', 'mostro-processed')

        expect(labelsCreate).not.toHaveBeenCalled()
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        })
    })

    it('crea el label la primera vez', async () => {
        const { client, modify, labelsCreate } = buildClient()

        await createGmailReader(client).addLabel('m1', 'mostro-failed')

        expect(labelsCreate).toHaveBeenCalledWith({
            userId: 'me',
            requestBody: { name: 'mostro-failed', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        })
    })
})

describe('createGmailReader().removeLabel', () => {
    it('quita el label del mensaje', async () => {
        const { client, modify } = buildClient()

        await createGmailReader(client).removeLabel('m1', 'mostro-processed')

        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { removeLabelIds: ['L1'] },
        })
    })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test src/mastra/lib/inbox/gmail-reader.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

`src/mastra/lib/inbox/gmail-reader.ts`:

```ts
import { getGmailClient } from '../mailer/gmail-client'

export const PROCESSED_LABEL = 'mostro-processed'
export const FAILED_LABEL = 'mostro-failed'

export type InboxMessage = {
    id: string
    from: string
    subject: string
    body: string
    receivedAt: Date
}

export type GmailReader = {
    search(query: string): Promise<InboxMessage[]>
    addLabel(id: string, label: string): Promise<void>
    removeLabel(id: string, label: string): Promise<void>
}

type GmailClient = ReturnType<typeof getGmailClient>
type Payload = {
    headers?: Array<{ name?: string | null; value?: string | null }>
    mimeType?: string | null
    body?: { data?: string | null } | null
    parts?: Payload[]
}

function headerOf(payload: Payload | undefined, name: string): string {
    const header = payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())
    return header?.value ?? ''
}

// "Farmacia <pedidos@farmacia.test>" -> "pedidos@farmacia.test". Sin display name
// el header ya viene limpio.
function emailOf(from: string): string {
    const match = from.match(/<([^>]+)>/)
    return (match ? match[1] : from).trim().toLowerCase()
}

function decode(data: string | null | undefined): string {
    return data ? Buffer.from(data, 'base64url').toString('utf-8') : ''
}

// Un mail puede traer el texto directo o repartido en parts (multipart/alternative
// con html + plano). Nos interesa el plano; si no hay, el primer body con datos.
function bodyOf(payload: Payload | undefined): string {
    if (!payload) return ''
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return decode(payload.body.data)
    }
    for (const part of payload.parts ?? []) {
        const found = bodyOf(part)
        if (found) return found
    }
    return decode(payload.body?.data)
}

export function createGmailReader(client?: GmailClient): GmailReader {
    const gmailFor = () => client ?? getGmailClient()
    const labelIds = new Map<string, string>()

    async function labelIdFor(name: string): Promise<string> {
        const cached = labelIds.get(name)
        if (cached) return cached

        const gmail = gmailFor()
        const { data } = await gmail.users.labels.list({ userId: 'me' })
        const existing = data.labels?.find(label => label.name === name)
        if (existing?.id) {
            labelIds.set(name, existing.id)
            return existing.id
        }

        const created = await gmail.users.labels.create({
            userId: 'me',
            requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        const id = created.data.id as string
        labelIds.set(name, id)
        return id
    }

    return {
        async search(query) {
            const gmail = gmailFor()
            const { data } = await gmail.users.messages.list({ userId: 'me', q: query })
            const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id))

            const messages = await Promise.all(ids.map(async id => {
                const { data: full } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
                const payload = full.payload as Payload | undefined
                return {
                    id,
                    from: emailOf(headerOf(payload, 'From')),
                    subject: headerOf(payload, 'Subject'),
                    body: bodyOf(payload),
                    receivedAt: new Date(Number(full.internalDate ?? 0)),
                }
            }))

            // Del más viejo al más nuevo: un acuse anterior tiene que procesarse antes
            // que la confirmación que lo sigue, o el segundo mail se evalúa contra un
            // step que todavía no avanzó.
            return messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
        },

        async addLabel(id, label) {
            const labelId = await labelIdFor(label)
            await gmailFor().users.messages.modify({
                userId: 'me',
                id,
                requestBody: { addLabelIds: [labelId] },
            })
        },

        async removeLabel(id, label) {
            const labelId = await labelIdFor(label)
            await gmailFor().users.messages.modify({
                userId: 'me',
                id,
                requestBody: { removeLabelIds: [labelId] },
            })
        },
    }
}

export const gmailReader = createGmailReader()
```

- [ ] **Step 4: Correr los tests**

Run: `pnpm test src/mastra/lib/inbox/gmail-reader.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox/gmail-reader.ts src/mastra/lib/inbox/gmail-reader.test.ts
git commit -m "feat: add gmail reader for searching and labelling messages"
```

---

### Task 4: Agente de extracción

Convierte la prosa del mail en los campos del step. Nunca elige el step: recibe el schema y
la descripción ya resueltos por el poller.

**Files:**
- Create: `src/mastra/lib/inbox/mail-extractor.ts`
- Test: `src/mastra/lib/inbox/mail-extractor.test.ts`

**Interfaces:**
- Produces:
  - `mailExtractorAgent: Agent` (se registra en `index.ts` en Task 7)
  - `type ExtractionResult = { matches: boolean; reason: string; data?: Record<string, unknown> }`
  - `type ExtractArgs = { subject: string; body: string; description: string; schema: z.ZodType }`
  - `type Extract = (mastra: unknown, args: ExtractArgs) => Promise<ExtractionResult>`
  - `extractFromMail: Extract`

- [ ] **Step 1: Escribir los tests que fallan**

`src/mastra/lib/inbox/mail-extractor.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { extractFromMail } from './mail-extractor'

const schema = z.object({ deliveryDate: z.string(), quantity: z.number() })

function buildMastra(object: unknown) {
    const generate = vi.fn().mockResolvedValue({ object })
    const mastra = { getAgent: vi.fn().mockReturnValue({ generate }) }
    return { mastra, generate }
}

const args = {
    subject: 'Confirmación',
    body: 'Entregamos 12 unidades el 11/03.',
    description: 'la confirmación de la fecha de entrega',
    schema,
}

describe('extractFromMail', () => {
    it('devuelve los datos cuando el mail corresponde al step', async () => {
        const { mastra } = buildMastra({
            matches: true,
            reason: 'confirma la fecha de entrega',
            data: { deliveryDate: '2026-03-11', quantity: 12 },
        })

        const result = await extractFromMail(mastra as never, args)

        expect(result).toEqual({
            matches: true,
            reason: 'confirma la fecha de entrega',
            data: { deliveryDate: '2026-03-11', quantity: 12 },
        })
    })

    it('devuelve matches false con el motivo cuando el mail no corresponde', async () => {
        const { mastra } = buildMastra({
            matches: false,
            reason: 'es un aviso de vacaciones, no una confirmación',
        })

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('vacaciones')
        expect(result.data).toBeUndefined()
    })

    it('le pasa al modelo la descripción del step y el cuerpo del mail', async () => {
        const { mastra, generate } = buildMastra({ matches: true, reason: 'ok', data: { deliveryDate: 'x', quantity: 1 } })

        await extractFromMail(mastra as never, args)

        const prompt = generate.mock.calls[0][0] as string
        expect(prompt).toContain('la confirmación de la fecha de entrega')
        expect(prompt).toContain('Entregamos 12 unidades el 11/03.')
    })

    it('trata como no coincidente una salida que dice matches true sin datos válidos', async () => {
        const { mastra } = buildMastra({ matches: true, reason: 'ok', data: { deliveryDate: '2026-03-11' } })

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('no validaron')
    })

    it('trata como no coincidente un fallo del modelo', async () => {
        const generate = vi.fn().mockRejectedValue(new Error('rate limited'))
        const mastra = { getAgent: vi.fn().mockReturnValue({ generate }) }

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('rate limited')
    })

    it('trata como no coincidente cuando el agente no está registrado', async () => {
        const mastra = { getAgent: vi.fn().mockReturnValue(undefined) }

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('mailExtractor')
    })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test src/mastra/lib/inbox/mail-extractor.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

`src/mastra/lib/inbox/mail-extractor.ts`:

```ts
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'

// Sin tools y sin memoria: lo único que hace es leer prosa y devolver campos. Toda
// decisión de flujo la toma el poller a partir del step suspendido del run, así que
// el modelo nunca elige qué workflow reanudar ni a quién escribirle.
export const mailExtractorAgent = new Agent({
    id: 'mail-extractor',
    name: 'Mail Extractor',
    description: 'Extrae datos estructurados de los mails que responden los proveedores.',
    instructions: `Sos un extractor de datos. Recibís un mail de un proveedor y una descripción de lo que se está esperando.

Tu única tarea es decidir si el mail es eso que se espera y, si lo es, extraer los campos pedidos.

Reglas:
- No inventes datos. Si un campo no está en el mail, el mail NO coincide.
- Las fechas se devuelven en formato YYYY-MM-DD. Si el mail dice "miércoles 11/03" y no aclara el año, usá el año en curso.
- Si el mail es un aviso general, una publicidad o cualquier cosa que no sea lo esperado, respondé matches: false y explicá por qué en reason.
- reason siempre se completa, tanto si coincide como si no.
- Respondé siempre en español.`,
    model: 'openrouter/deepseek/deepseek-v4-flash',
})

export type ExtractionResult = {
    matches: boolean
    reason: string
    data?: Record<string, unknown>
}

export type ExtractArgs = {
    subject: string
    body: string
    description: string
    schema: z.ZodType
}

export type Extract = (mastra: unknown, args: ExtractArgs) => Promise<ExtractionResult>

type MastraLike = { getAgent: (id: string) => { generate: (prompt: string, options: unknown) => Promise<{ object?: unknown }> } | undefined }

export const extractFromMail: Extract = async (mastra, { subject, body, description, schema }) => {
    const agent = (mastra as MastraLike | undefined)?.getAgent('mailExtractor')
    if (!agent) {
        return { matches: false, reason: 'el agente mailExtractor no está registrado en mastra' }
    }

    const prompt = `Se está esperando: ${description}

Mail recibido
Asunto: ${subject}

${body}`

    // El wrapper deja que el modelo diga que no sin tener que inventar campos para
    // cumplir el schema. matches y reason son siempre obligatorios; data solo cuando
    // coincide.
    const wrapped = z.object({
        matches: z.boolean(),
        reason: z.string(),
        data: schema.optional(),
    })

    try {
        const response = await agent.generate(prompt, {
            structuredOutput: { schema: wrapped, errorStrategy: 'strict' },
        })

        const parsed = wrapped.safeParse(response.object)
        if (!parsed.success) {
            return { matches: false, reason: `la salida del modelo no validó contra el schema esperado` }
        }

        // matches true sin data válida es una salida incoherente: no se reanuda nada
        // con campos incompletos.
        if (parsed.data.matches && parsed.data.data === undefined) {
            return { matches: false, reason: 'el modelo dijo que coincide pero los campos no validaron' }
        }

        return {
            matches: parsed.data.matches,
            reason: parsed.data.reason,
            data: parsed.data.matches ? (parsed.data.data as Record<string, unknown>) : undefined,
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { matches: false, reason: `falló la extracción: ${detail}` }
    }
}
```

- [ ] **Step 4: Correr los tests**

Run: `pnpm test src/mastra/lib/inbox/mail-extractor.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox/mail-extractor.ts src/mastra/lib/inbox/mail-extractor.test.ts
git commit -m "feat: add mail extractor agent with a match-or-explain wrapper"
```

---

### Task 5: Aviso de fallo

Cuando un mail no se puede procesar, avisa a todos los suscriptores del dominio.

**Files:**
- Create: `src/mastra/lib/inbox/notify-mail-failure.ts`
- Test: `src/mastra/lib/inbox/notify-mail-failure.test.ts`

**Interfaces:**
- Produces:
  - `type MailFailure = { domain: 'diapers' | 'meds' | 'refunds'; from: string; subject: string; reason: string }`
  - `type NotifyFailure = (mastra: unknown, failure: MailFailure) => Promise<number>` — devuelve a cuántos avisó.
  - `notifyMailFailure: NotifyFailure`

- [ ] **Step 1: Escribir los tests que fallan**

`src/mastra/lib/inbox/notify-mail-failure.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../business/repositories', () => ({
    subscriberRepository: { list: vi.fn() },
}))
vi.mock('../resolve-telegram-thread', () => ({
    resolveTelegramThread: vi.fn(),
}))

import { subscriberRepository } from '../../../business/repositories'
import { resolveTelegramThread } from '../resolve-telegram-thread'
import { notifyMailFailure } from './notify-mail-failure'

const failure = {
    domain: 'diapers' as const,
    from: 'pedidos@farmacia.test',
    subject: 'Cierre por vacaciones',
    reason: 'no es una confirmación de pedido',
}

function buildMastra() {
    const sendNotificationSignal = vi.fn().mockResolvedValue(undefined)
    const mastra = { getAgent: vi.fn().mockReturnValue({ sendNotificationSignal }) }
    return { mastra, sendNotificationSignal }
}

beforeEach(() => {
    vi.mocked(subscriberRepository.list).mockResolvedValue(['ana@gmail.com', 'beto@gmail.com'])
    vi.mocked(resolveTelegramThread).mockResolvedValue({ resourceId: 'x', threadId: 't1' })
})

describe('notifyMailFailure', () => {
    it('avisa a todos los suscriptores del dominio', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        const sent = await notifyMailFailure(mastra as never, failure)

        expect(subscriberRepository.list).toHaveBeenCalledWith('diapers')
        expect(sent).toBe(2)
        expect(sendNotificationSignal).toHaveBeenCalledTimes(2)
    })

    it('encuadra el aviso como mensaje del sistema para que el supervisor lo reenvíe', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        await notifyMailFailure(mastra as never, failure)

        const [signal] = sendNotificationSignal.mock.calls[0]
        expect(signal.summary).toContain('[AVISO DEL SISTEMA')
        expect(signal.summary).toContain('Reenviá este aviso tal cual')
    })

    it('incluye remitente, asunto y motivo en el aviso', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        await notifyMailFailure(mastra as never, failure)

        const [signal] = sendNotificationSignal.mock.calls[0]
        expect(signal.summary).toContain('pedidos@farmacia.test')
        expect(signal.summary).toContain('Cierre por vacaciones')
        expect(signal.summary).toContain('no es una confirmación de pedido')
    })

    it('aclara que solo un admin puede reintentar', async () => {
        const { mastra, sendNotificationSignal } = buildMastra()

        await notifyMailFailure(mastra as never, failure)

        const [signal] = sendNotificationSignal.mock.calls[0]
        expect(signal.summary).toContain('admin')
    })

    it('saltea a los suscriptores sin thread de telegram', async () => {
        vi.mocked(resolveTelegramThread).mockResolvedValueOnce(null)
        const { mastra, sendNotificationSignal } = buildMastra()

        const sent = await notifyMailFailure(mastra as never, failure)

        expect(sent).toBe(1)
        expect(sendNotificationSignal).toHaveBeenCalledTimes(1)
    })

    // getAgent lanza cuando la clave no está registrada, no devuelve undefined.
    // Este es el caso que de verdad ocurre en producción.
    it('no falla cuando getAgent lanza porque el supervisor no está registrado', async () => {
        const mastra = {
            getAgent: vi.fn().mockImplementation(() => {
                throw new Error('Agent with name mostroSupervisor not found')
            }),
        }

        const sent = await notifyMailFailure(mastra as never, failure)

        expect(sent).toBe(0)
    })

    it('no falla cuando no hay instancia de mastra', async () => {
        const sent = await notifyMailFailure(undefined, failure)

        expect(sent).toBe(0)
    })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test src/mastra/lib/inbox/notify-mail-failure.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

`src/mastra/lib/inbox/notify-mail-failure.ts`:

```ts
import { subscriberRepository } from '../../../business/repositories'
import { resolveTelegramThread } from '../resolve-telegram-thread'

export type MailFailure = {
    domain: 'diapers' | 'meds' | 'refunds'
    from: string
    subject: string
    reason: string
}

export type NotifyFailure = (mastra: unknown, failure: MailFailure) => Promise<number>

type SupervisorLike = {
    sendNotificationSignal: (signal: unknown, target: unknown) => Promise<unknown>
}
type MastraLike = { getAgent: (id: string) => SupervisorLike | undefined }

const DOMAIN_LABEL = {
    diapers: 'pañales',
    meds: 'medicamentos',
    refunds: 'reembolsos',
} as const

// getAgent lanza MastraError si la clave no está registrada, no devuelve undefined
// (node_modules/@mastra/core/dist/mastra/index.d.ts:667). Un aviso que no se puede
// entregar no debe romper el ciclo de polling: el mail ya quedó etiquetado.
function supervisorOf(mastra: unknown): SupervisorLike | undefined {
    try {
        return (mastra as MastraLike | undefined)?.getAgent('mostroSupervisor')
    } catch {
        return undefined
    }
}

export const notifyMailFailure: NotifyFailure = async (mastra, failure) => {
    const supervisor = supervisorOf(mastra)
    if (!supervisor) {
        console.warn('[notify-mail-failure] no supervisor available, skipping')
        return 0
    }

    const emails = await subscriberRepository.list(failure.domain)
    let sent = 0

    for (const email of emails) {
        const target = await resolveTelegramThread(mastra as never, email)
        if (!target) {
            console.warn(`[notify-mail-failure] no telegram thread for ${email}, skipping`)
            continue
        }

        // Sin el encuadre de aviso del sistema el supervisor interpreta la notificación
        // como una tarea e intenta actuar sobre ella en vez de reenviarla.
        await supervisor.sendNotificationSignal(
            {
                source: failure.domain,
                kind: 'mail-processing-failed',
                priority: 'high',
                summary: `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este aviso tal cual en texto plano, sin delegar ni usar tools: no pude procesar un mail de ${DOMAIN_LABEL[failure.domain]} enviado por ${failure.from} con asunto "${failure.subject}". Motivo: ${failure.reason}. Queda en espera; un admin puede pedirme que lo reintente.`,
                payload: {
                    from: failure.from,
                    subject: failure.subject,
                    reason: failure.reason,
                },
            },
            target,
        )
        sent++
    }

    return sent
}
```

- [ ] **Step 4: Correr los tests**

Run: `pnpm test src/mastra/lib/inbox/notify-mail-failure.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox/notify-mail-failure.ts src/mastra/lib/inbox/notify-mail-failure.test.ts
git commit -m "feat: notify domain subscribers when a mail cannot be processed"
```

---

### Task 6: El ciclo de polling

El corazón del cambio. Lee la cola, resuelve el step suspendido **por cada mail**, extrae y
reanuda.

**Files:**
- Create: `src/mastra/lib/inbox/poll-mailbox.ts`
- Test: `src/mastra/lib/inbox/poll-mailbox.test.ts`

**Interfaces:**
- Consumes: `GmailReader`, `InboxMessage`, `PROCESSED_LABEL`, `FAILED_LABEL` (Task 3); `Extract` (Task 4); `NotifyFailure` (Task 5); `yearMonthOf`, `previousYearMonth` (Task 2).
- Produces:
  - `type ResumeResult = { ok: boolean; reason?: string }`
  - `type StepConfig = { schema: z.ZodType; description: string; resume: (mastra: unknown, data: Record<string, unknown>, yearMonth: string) => Promise<ResumeResult> }`
  - `type PollConfig = { domain: 'diapers' | 'meds' | 'refunds'; sender: string; workflowId: string; getRunId: (yearMonth: string) => string; steps: Record<string, StepConfig> }`
  - `type PollDeps = { reader: GmailReader; extract: Extract; notifyFailure: NotifyFailure; readSuspendedStep: (mastra: unknown, workflowId: string, runId: string) => Promise<string | null> }`
  - `runPollCycle(mastra: unknown, config: PollConfig, deps?: Partial<PollDeps>): Promise<{ processed: number; failed: number }>`
  - `readSuspendedStep(mastra, workflowId, runId): Promise<string | null>`

- [ ] **Step 1: Escribir los tests que fallan**

`src/mastra/lib/inbox/poll-mailbox.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runPollCycle, readSuspendedStep } from './poll-mailbox'
import type { InboxMessage } from './gmail-reader'

const confirmSchema = z.object({ deliveryDate: z.string(), quantity: z.number() })

function message(overrides: Partial<InboxMessage> = {}): InboxMessage {
    return {
        id: 'm1',
        from: 'pedidos@farmacia.test',
        subject: 'Confirmación',
        body: 'Entregamos 12 el 11/03.',
        receivedAt: new Date('2026-07-15T10:00:00Z'),
        ...overrides,
    }
}

function buildConfig(resume = vi.fn().mockResolvedValue({ ok: true })) {
    return {
        config: {
            domain: 'diapers' as const,
            sender: 'pedidos@farmacia.test',
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
    }
}

function buildDeps(overrides: Record<string, unknown> = {}) {
    const addLabel = vi.fn().mockResolvedValue(undefined)
    const removeLabel = vi.fn().mockResolvedValue(undefined)
    const search = vi.fn().mockResolvedValue([message()])
    const extract = vi.fn().mockResolvedValue({
        matches: true,
        reason: 'confirma la entrega',
        data: { deliveryDate: '2026-03-11', quantity: 12 },
    })
    const notifyFailure = vi.fn().mockResolvedValue(1)
    const readSuspendedStep = vi.fn().mockResolvedValue('wait-diapers-confirmation')

    return {
        deps: { reader: { search, addLabel, removeLabel }, extract, notifyFailure, readSuspendedStep, ...overrides },
        search, addLabel, removeLabel, extract, notifyFailure, readSuspendedStep,
    }
}

describe('runPollCycle — query', () => {
    it('consulta solo el remitente del dominio, excluyendo lo ya etiquetado', async () => {
        const { config } = buildConfig()
        const { deps, search } = buildDeps()

        await runPollCycle({}, config, deps)

        const query = search.mock.calls[0][0] as string
        expect(query).toContain('from:pedidos@farmacia.test')
        expect(query).toContain('-label:mostro-processed')
        expect(query).toContain('-label:mostro-failed')
        expect(query).toContain('newer_than:30d')
    })
})

describe('runPollCycle — camino feliz', () => {
    it('reanuda el workflow y marca el mail como procesado', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()

        const result = await runPollCycle({}, config, deps)

        expect(resume).toHaveBeenCalledWith({}, { deliveryDate: '2026-03-11', quantity: 12 }, '2026-07')
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-processed')
        expect(notifyFailure).not.toHaveBeenCalled()
        expect(result).toEqual({ processed: 1, failed: 0 })
    })

    it('le pasa al extractor el schema y la descripción del step suspendido', async () => {
        const { config } = buildConfig()
        const { deps, extract } = buildDeps()

        await runPollCycle({}, config, deps)

        const args = extract.mock.calls[0][1]
        expect(args.schema).toBe(confirmSchema)
        expect(args.description).toBe('la confirmación de la fecha de entrega')
        expect(args.body).toBe('Entregamos 12 el 11/03.')
    })
})

describe('runPollCycle — resolución del mes', () => {
    it('usa el mes del mail cuando ahí hay un run suspendido', async () => {
        const { config, resume } = buildConfig()
        const { deps, readSuspendedStep } = buildDeps()

        await runPollCycle({}, config, deps)

        expect(readSuspendedStep).toHaveBeenCalledWith({}, 'diapersWorkflow', 'diapers-2026-07')
        expect(resume).toHaveBeenCalledWith({}, expect.anything(), '2026-07')
    })

    it('cae al mes anterior cuando el mes del mail no tiene run suspendido', async () => {
        const { config, resume } = buildConfig()
        const { deps, readSuspendedStep } = buildDeps()
        readSuspendedStep.mockImplementation(async (_m: unknown, _w: string, runId: string) =>
            runId === 'diapers-2026-06' ? 'wait-diapers-confirmation' : null)
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ receivedAt: new Date('2026-07-02T10:00:00Z') }),
        ])

        await runPollCycle({}, config, deps)

        expect(resume).toHaveBeenCalledWith({}, expect.anything(), '2026-06')
    })
})

describe('runPollCycle — fallos', () => {
    it('marca failed y avisa cuando no hay run suspendido en ningún mes', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()
        deps.readSuspendedStep = vi.fn().mockResolvedValue(null)

        const result = await runPollCycle({}, config, deps)

        expect(resume).not.toHaveBeenCalled()
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure).toHaveBeenCalledWith({}, expect.objectContaining({
            domain: 'diapers',
            from: 'pedidos@farmacia.test',
            subject: 'Confirmación',
        }))
        expect(result).toEqual({ processed: 0, failed: 1 })
    })

    it('marca failed cuando el step suspendido no está en el mapa del dominio', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()
        deps.readSuspendedStep = vi.fn().mockResolvedValue('notify-users')

        await runPollCycle({}, config, deps)

        expect(resume).not.toHaveBeenCalled()
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        const failure = notifyFailure.mock.calls[0][1]
        expect(failure.reason).toContain('notify-users')
    })

    it('marca failed con el motivo del extractor cuando el mail no corresponde', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()
        deps.extract = vi.fn().mockResolvedValue({ matches: false, reason: 'es un aviso de vacaciones' })

        await runPollCycle({}, config, deps)

        expect(resume).not.toHaveBeenCalled()
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure.mock.calls[0][1].reason).toBe('es un aviso de vacaciones')
    })

    it('marca failed cuando la función de resume rechaza', async () => {
        const resume = vi.fn().mockResolvedValue({ ok: false, reason: 'not_suspended' })
        const { config } = buildConfig(resume)
        const { deps, addLabel, notifyFailure } = buildDeps()

        await runPollCycle({}, config, deps)

        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure.mock.calls[0][1].reason).toContain('not_suspended')
    })

    it('marca failed cuando la función de resume lanza', async () => {
        const resume = vi.fn().mockRejectedValue(new Error('mongo caído'))
        const { config } = buildConfig(resume)
        const { deps, addLabel, notifyFailure } = buildDeps()

        const result = await runPollCycle({}, config, deps)

        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure.mock.calls[0][1].reason).toContain('mongo caído')
        expect(result).toEqual({ processed: 0, failed: 1 })
    })

    it('sigue procesando la tanda cuando el etiquetado falla', async () => {
        const { config } = buildConfig()
        const { deps } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'a' }),
            message({ id: 'b' }),
        ])
        deps.reader.addLabel = vi.fn()
            .mockRejectedValueOnce(new Error('gmail 503'))
            .mockResolvedValue(undefined)

        const result = await runPollCycle({}, config, deps)

        // El primero se reanudó igual: el fallo es solo de la etiqueta.
        expect(result).toEqual({ processed: 2, failed: 0 })
    })

    it('sigue procesando la tanda cuando el aviso de fallo lanza', async () => {
        const { config } = buildConfig()
        const { deps } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'a' }),
            message({ id: 'b' }),
        ])
        deps.extract = vi.fn().mockResolvedValue({ matches: false, reason: 'ruido' })
        deps.notifyFailure = vi.fn().mockRejectedValue(new Error('telegram caído'))

        const result = await runPollCycle({}, config, deps)

        expect(result).toEqual({ processed: 0, failed: 2 })
    })

    it('sigue con el resto de los mails cuando uno falla', async () => {
        const { config } = buildConfig()
        const { deps, addLabel } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'malo' }),
            message({ id: 'bueno' }),
        ])
        deps.extract = vi.fn()
            .mockResolvedValueOnce({ matches: false, reason: 'ruido' })
            .mockResolvedValueOnce({ matches: true, reason: 'ok', data: { deliveryDate: '2026-03-11', quantity: 12 } })

        const result = await runPollCycle({}, config, deps)

        expect(addLabel).toHaveBeenCalledWith('malo', 'mostro-failed')
        expect(addLabel).toHaveBeenCalledWith('bueno', 'mostro-processed')
        expect(result).toEqual({ processed: 1, failed: 1 })
    })
})

describe('readSuspendedStep', () => {
    // getWorkflow lanza cuando el id no está registrado, no devuelve undefined.
    it('devuelve null en vez de propagar cuando el workflow no está registrado', async () => {
        const mastra = {
            getWorkflow: vi.fn().mockImplementation(() => {
                throw new Error('Workflow with ID diapersWorkflow not found')
            }),
        }

        await expect(readSuspendedStep(mastra, 'diapersWorkflow', 'diapers-2026-07'))
            .resolves.toBeNull()
    })

    it('devuelve null cuando no existe el run', async () => {
        const mastra = {
            getWorkflow: vi.fn().mockReturnValue({
                getWorkflowRunById: vi.fn().mockResolvedValue(null),
            }),
        }

        await expect(readSuspendedStep(mastra, 'diapersWorkflow', 'diapers-2026-07'))
            .resolves.toBeNull()
    })
})

describe('runPollCycle — estado que avanza dentro de la misma tanda', () => {
    it('relee el step suspendido por cada mail, no una vez por ciclo', async () => {
        const resume = vi.fn().mockResolvedValue({ ok: true })
        const config = {
            domain: 'meds' as const,
            sender: 'farmacia@proveedor.test',
            workflowId: 'medsWorkflow',
            getRunId: (ym: string) => `meds-${ym}`,
            steps: {
                'wait-meds-acknowledge': { schema: z.object({}), description: 'el acuse', resume },
                'wait-meds-confirmation': { schema: z.object({ deliveryDate: z.string() }), description: 'la entrega', resume },
            },
        }
        const { deps, extract, readSuspendedStep } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'ack', body: 'Recibimos su pedido.' }),
            message({ id: 'entrega', body: 'Entregamos el 11/03.' }),
        ])
        // El primer mail avanza el run de acuse a confirmación.
        readSuspendedStep
            .mockResolvedValueOnce('wait-meds-acknowledge')
            .mockResolvedValueOnce('wait-meds-confirmation')
        extract
            .mockResolvedValueOnce({ matches: true, reason: 'acuse', data: {} })
            .mockResolvedValueOnce({ matches: true, reason: 'entrega', data: { deliveryDate: '2026-03-11' } })

        const result = await runPollCycle({}, config, deps)

        expect(readSuspendedStep).toHaveBeenCalledTimes(2)
        expect(extract.mock.calls[0][1].description).toBe('el acuse')
        expect(extract.mock.calls[1][1].description).toBe('la entrega')
        expect(result).toEqual({ processed: 2, failed: 0 })
    })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test src/mastra/lib/inbox/poll-mailbox.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar**

`src/mastra/lib/inbox/poll-mailbox.ts`:

```ts
import { createWorkflowStateReader } from '@mastra/core/workflows'
import type { z } from 'zod'
import { previousYearMonth, yearMonthOf } from '../date-scope'
import { FAILED_LABEL, PROCESSED_LABEL, gmailReader, type GmailReader, type InboxMessage } from './gmail-reader'
import { extractFromMail, type Extract } from './mail-extractor'
import { notifyMailFailure, type NotifyFailure } from './notify-mail-failure'

export type ResumeResult = { ok: boolean; reason?: string }

export type StepConfig = {
    schema: z.ZodType
    description: string
    resume: (mastra: unknown, data: Record<string, unknown>, yearMonth: string) => Promise<ResumeResult>
}

export type PollConfig = {
    domain: 'diapers' | 'meds' | 'refunds'
    sender: string
    workflowId: string
    getRunId: (yearMonth: string) => string
    steps: Record<string, StepConfig>
}

export type PollDeps = {
    reader: GmailReader
    extract: Extract
    notifyFailure: NotifyFailure
    readSuspendedStep: (mastra: unknown, workflowId: string, runId: string) => Promise<string | null>
}

type WorkflowLike = { getWorkflowRunById: (runId: string) => Promise<unknown> }
type MastraLike = { getWorkflow: (id: string) => WorkflowLike | undefined }

// getWorkflow lanza MastraError si el id no está registrado, no devuelve undefined
// (node_modules/@mastra/core/dist/chunk-PQ5PN4TW.js, getWorkflow). Tratamos "no
// registrado" como "no hay run abierto": el mail cae a mostro-failed con motivo, en vez
// de tumbar el ciclo entero y dejar los mails siguientes sin procesar.
export async function readSuspendedStep(
    mastra: unknown,
    workflowId: string,
    runId: string,
): Promise<string | null> {
    let run: unknown
    try {
        const workflow = (mastra as MastraLike | undefined)?.getWorkflow(workflowId)
        run = await workflow?.getWorkflowRunById(runId)
    } catch {
        return null
    }
    if (!run) return null

    const reader = createWorkflowStateReader(run as never)
    if (reader.getStatus() !== 'suspended') return null

    return reader.getSuspendedStep()?.stepId ?? null
}

const defaultDeps: PollDeps = {
    reader: gmailReader,
    extract: extractFromMail,
    notifyFailure: notifyMailFailure,
    readSuspendedStep,
}

// El mail de respuesta no siempre cae en el mes del pedido: uno abierto el 30 de julio se
// puede confirmar el 2 de agosto. Se prueba el mes del mail y después el anterior.
async function resolveOpenRun(
    mastra: unknown,
    config: PollConfig,
    deps: PollDeps,
    message: InboxMessage,
): Promise<{ yearMonth: string; stepId: string } | null> {
    const candidates = [yearMonthOf(message.receivedAt)]
    candidates.push(previousYearMonth(candidates[0]))

    for (const yearMonth of candidates) {
        const stepId = await deps.readSuspendedStep(mastra, config.workflowId, config.getRunId(yearMonth))
        if (stepId) return { yearMonth, stepId }
    }
    return null
}

export async function runPollCycle(
    mastra: unknown,
    config: PollConfig,
    deps: Partial<PollDeps> = {},
): Promise<{ processed: number; failed: number }> {
    const resolved: PollDeps = { ...defaultDeps, ...deps }
    const query = `from:${config.sender} -label:${PROCESSED_LABEL} -label:${FAILED_LABEL} newer_than:30d`
    const messages = await resolved.reader.search(query)

    let processed = 0
    let failed = 0

    // Etiquetar y avisar son I/O que puede fallar. Si cualquiera de las dos propaga,
    // los mails que faltan de la tanda quedan sin procesar — peor que no avisar de uno.
    const fail = async (message: InboxMessage, reason: string) => {
        failed++
        try {
            await resolved.reader.addLabel(message.id, FAILED_LABEL)
        } catch (error) {
            console.error(`[poll-${config.domain}] no pude etiquetar ${message.id} como fallido`, error)
        }
        try {
            await resolved.notifyFailure(mastra, {
                domain: config.domain,
                from: message.from,
                subject: message.subject,
                reason,
            })
        } catch (error) {
            console.error(`[poll-${config.domain}] no pude avisar del fallo de ${message.id}`, error)
        }
    }

    for (const message of messages) {
        // Por mail y no una vez por ciclo: si el primero avanza el run a la etapa
        // siguiente, el segundo tiene que evaluarse contra el step nuevo.
        const open = await resolveOpenRun(mastra, config, resolved, message)
        if (!open) {
            await fail(message, 'no hay ningún pedido abierto esperando una respuesta para este mes ni el anterior')
            continue
        }

        const step = config.steps[open.stepId]
        if (!step) {
            await fail(message, `el pedido está en el paso "${open.stepId}", que no espera mails`)
            continue
        }

        const extraction = await resolved.extract(mastra, {
            subject: message.subject,
            body: message.body,
            description: step.description,
            schema: step.schema,
        })

        if (!extraction.matches) {
            await fail(message, extraction.reason)
            continue
        }

        try {
            const result = await step.resume(mastra, extraction.data ?? {}, open.yearMonth)
            if (!result.ok) {
                await fail(message, `el workflow rechazó la reanudación: ${result.reason ?? 'sin motivo'}`)
                continue
            }
        } catch (error) {
            await fail(message, error instanceof Error ? error.message : String(error))
            continue
        }

        // El workflow ya se reanudó: el trabajo está hecho aunque la etiqueta no salga.
        // Sin la etiqueta el mail vuelve a la cola y el próximo ciclo lo reintenta, pero
        // ahí el run ya no está suspendido en ese step y cae a mostro-failed con motivo,
        // que es visible. Propagar en cambio dejaría el resto de la tanda sin procesar.
        try {
            await resolved.reader.addLabel(message.id, PROCESSED_LABEL)
        } catch (error) {
            console.error(`[poll-${config.domain}] reanudé el workflow pero no pude etiquetar ${message.id} como procesado`, error)
        }
        processed++
    }

    return { processed, failed }
}
```

- [ ] **Step 4: Correr los tests**

Run: `pnpm test src/mastra/lib/inbox/poll-mailbox.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/inbox/poll-mailbox.ts src/mastra/lib/inbox/poll-mailbox.test.ts
git commit -m "feat: add the polling cycle that routes mail by suspended step"
```

---

### Task 7: Los tres workflows de polling

Configuración sobre el helper, cada uno con su schedule.

**Files:**
- Create: `src/mastra/workflows/diapers/diapers-poll.workflow.ts`
- Create: `src/mastra/workflows/meds/meds-poll.workflow.ts`
- Create: `src/mastra/workflows/refunds/refunds-poll.workflow.ts`
- Modify: `src/mastra/index.ts:24-28,69,70`

**Interfaces:**
- Consumes: `runPollCycle`, `PollConfig` (Task 6); `mailExtractorAgent` (Task 4); las funciones de resume de `src/mastra/lib/*-run.ts`; los schemas `wait-*-resume.schema.ts`; `getDiapersRunId` / `getMedsRunId` / `getRefundsRunId`.
- Produces: `diapersPollWorkflow`, `medsPollWorkflow`, `refundsPollWorkflow`.

- [ ] **Step 1: Crear el workflow de diapers**

`src/mastra/workflows/diapers/diapers-poll.workflow.ts`:

```ts
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../config/app.config'
import { confirmDiapersDate } from '../../lib/diapers-run'
import { runPollCycle, type PollConfig } from '../../lib/inbox/poll-mailbox'
import { waitDiapersConfirmationResumeSchema } from './schemas/wait-diapers-confirmation-resume.schema'
import { getDiapersRunId } from './utils/diapers.utils'

const config: PollConfig = {
    domain: 'diapers',
    // El proveedor responde desde la misma casilla a la que le escribimos.
    sender: appConfig.DIAPERS_EMAIL_TO,
    workflowId: 'diapersWorkflow',
    getRunId: getDiapersRunId,
    steps: {
        'wait-diapers-confirmation': {
            schema: waitDiapersConfirmationResumeSchema,
            description: 'la confirmación del pedido de pañales, con la fecha de entrega, la cantidad y el domicilio',
            resume: (mastra, data, yearMonth) => confirmDiapersDate(mastra as never, {
                deliveryDate: data.deliveryDate as string,
                deliveryAddress: data.deliveryAddress as string,
                quantity: data.quantity as number,
                yearMonth,
            }),
        },
    },
}

const pollStep = createStep({
    id: 'poll-diapers-mailbox',
    inputSchema: z.object({}),
    outputSchema: z.object({ processed: z.number(), failed: z.number() }),
    execute: async ({ mastra }) => runPollCycle(mastra, config),
})

export const diapersPollWorkflow = createWorkflow({
    id: 'diapers-poll',
    inputSchema: z.object({}),
    outputSchema: z.object({ processed: z.number(), failed: z.number() }),
    schedule: {
        cron: '*/15 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(pollStep)
    .commit()
```

- [ ] **Step 2: Crear el workflow de meds**

`src/mastra/workflows/meds/meds-poll.workflow.ts`:

```ts
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../config/app.config'
import { acknowledgeMedsOrder, confirmMedsDelivery } from '../../lib/meds-run'
import { runPollCycle, type PollConfig } from '../../lib/inbox/poll-mailbox'
import { waitMedsAcknowledgeResumeSchema } from './schemas/wait-meds-acknowledge-resume.schema'
import { waitMedsConfirmationResumeSchema } from './schemas/wait-meds-confirmation-resume.schema'
import { getMedsRunId } from './utils/meds.utils'

const config: PollConfig = {
    domain: 'meds',
    sender: appConfig.MEDS_EMAIL_TO,
    workflowId: 'medsWorkflow',
    getRunId: getMedsRunId,
    steps: {
        // El acuse no aporta datos: su schema es vacío y el modelo solo decide si el
        // mail es un acuse.
        'wait-meds-acknowledge': {
            schema: waitMedsAcknowledgeResumeSchema,
            description: 'un acuse de recibo del pedido de medicamentos, sin fecha de entrega todavía',
            resume: (mastra, _data, yearMonth) => acknowledgeMedsOrder(mastra as never, yearMonth),
        },
        'wait-meds-confirmation': {
            schema: waitMedsConfirmationResumeSchema,
            description: 'la confirmación de la entrega de los medicamentos, con la fecha y el domicilio',
            resume: (mastra, data, yearMonth) => confirmMedsDelivery(mastra as never, {
                deliveryDate: data.deliveryDate as string,
                deliveryAddress: data.deliveryAddress as string,
                yearMonth,
            }),
        },
    },
}

const pollStep = createStep({
    id: 'poll-meds-mailbox',
    inputSchema: z.object({}),
    outputSchema: z.object({ processed: z.number(), failed: z.number() }),
    execute: async ({ mastra }) => runPollCycle(mastra, config),
})

export const medsPollWorkflow = createWorkflow({
    id: 'meds-poll',
    inputSchema: z.object({}),
    outputSchema: z.object({ processed: z.number(), failed: z.number() }),
    schedule: {
        cron: '*/15 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(pollStep)
    .commit()
```

- [ ] **Step 3: Crear el workflow de refunds**

`src/mastra/workflows/refunds/refunds-poll.workflow.ts`:

```ts
import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../config/app.config'
import { acknowledgeRefund, confirmRefund, receiveDeposit } from '../../lib/refunds-run'
import { runPollCycle, type PollConfig } from '../../lib/inbox/poll-mailbox'
import { waitDepositResumeSchema } from './schemas/wait-deposit-resume.schema'
import { waitRefundAckResumeSchema } from './schemas/wait-refund-ack-resume.schema'
import { waitRefundConfirmationResumeSchema } from './schemas/wait-refund-confirmation-resume.schema'
import { getRefundsRunId } from './utils/refunds.utils'

const config: PollConfig = {
    domain: 'refunds',
    sender: appConfig.REFUNDS_EMAIL_TO,
    workflowId: 'refundsWorkflow',
    getRunId: getRefundsRunId,
    steps: {
        'wait-refund-ack': {
            schema: waitRefundAckResumeSchema,
            description: 'un acuse de recibo del pedido de reembolso, sin resolución todavía',
            resume: (mastra, _data, yearMonth) => acknowledgeRefund(mastra as never, yearMonth),
        },
        'wait-refund-confirmation': {
            schema: waitRefundConfirmationResumeSchema,
            description: 'la confirmación de que el reembolso fue aprobado, con su número de referencia',
            resume: (mastra, data, yearMonth) => confirmRefund(mastra as never, {
                refundReference: data.refundReference as string,
                yearMonth,
            }),
        },
        'wait-deposit': {
            schema: waitDepositResumeSchema,
            description: 'el aviso de que el dinero del reembolso fue depositado, con el monto y la fecha',
            resume: (mastra, data, yearMonth) => receiveDeposit(mastra as never, {
                depositAmount: data.depositAmount as number,
                depositDate: data.depositDate as string,
                yearMonth,
            }),
        },
    },
}

const pollStep = createStep({
    id: 'poll-refunds-mailbox',
    inputSchema: z.object({}),
    outputSchema: z.object({ processed: z.number(), failed: z.number() }),
    execute: async ({ mastra }) => runPollCycle(mastra, config),
})

export const refundsPollWorkflow = createWorkflow({
    id: 'refunds-poll',
    inputSchema: z.object({}),
    outputSchema: z.object({ processed: z.number(), failed: z.number() }),
    schedule: {
        cron: '*/15 * * * *',
        timezone: 'America/Argentina/Buenos_Aires',
        inputData: {},
    },
})
    .then(pollStep)
    .commit()
```

- [ ] **Step 4: Registrar los workflows y el agente extractor**

En `src/mastra/index.ts`, agregar los imports junto a los existentes:

```ts
import { diapersPollWorkflow } from './workflows/diapers/diapers-poll.workflow';
import { medsPollWorkflow } from './workflows/meds/meds-poll.workflow';
import { refundsPollWorkflow } from './workflows/refunds/refunds-poll.workflow';
import { mailExtractorAgent } from './lib/inbox/mail-extractor';
```

Y reemplazar las líneas 69-70 por:

```ts
    workflows: {
        weatherWorkflow, diapersWorkflow, medsWorkflow, refundsWorkflow,
        diapersPollWorkflow, medsPollWorkflow, refundsPollWorkflow,
    },
    agents: { weatherAgent, diapersAgent, medsAgent, refundsAgent, mostroSupervisor, mailExtractor: mailExtractorAgent },
```

La clave `mailExtractor` tiene que coincidir con el `getAgent('mailExtractor')` de
`mail-extractor.ts`.

- [ ] **Step 5: Verificar tipos y arranque**

Run: `pnpm run typecheck`
Expected: sin errores.

Run: `pnpm test`
Expected: PASS — todo lo anterior sigue verde.

- [ ] **Step 6: Commit**

```bash
git add src/mastra/workflows/diapers/diapers-poll.workflow.ts src/mastra/workflows/meds/meds-poll.workflow.ts src/mastra/workflows/refunds/refunds-poll.workflow.ts src/mastra/index.ts
git commit -m "feat: add scheduled mailbox pollers for diapers, meds and refunds"
```

---

### Task 8: Tools de reintento

Devuelven a la cola los mails que quedaron en `mostro-failed`. Solo admins.

**Files:**
- Create: `src/mastra/lib/inbox/retry-failed-mails.ts`
- Test: `src/mastra/lib/inbox/retry-failed-mails.test.ts`
- Create: `src/mastra/tools/diapers-retry-failed-mail-tool.ts`
- Create: `src/mastra/tools/meds-retry-failed-mail-tool.ts`
- Create: `src/mastra/tools/refunds-retry-failed-mail-tool.ts`
- Test: `src/mastra/tools/diapers-retry-failed-mail-tool.test.ts`
- Modify: `src/mastra/agents/diapers-agent.ts`, `src/mastra/agents/meds-agent.ts`, `src/mastra/agents/refunds-agent.ts`

**Interfaces:**
- Consumes: `GmailReader`, `FAILED_LABEL`, `gmailReader` (Task 3).
- Produces: `retryFailedMails(sender: string, reader?: GmailReader): Promise<number>` — devuelve cuántos mails volvieron a la cola.

- [ ] **Step 1: Escribir el test del helper**

`src/mastra/lib/inbox/retry-failed-mails.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { retryFailedMails } from './retry-failed-mails'

describe('retryFailedMails', () => {
    it('le saca el label de fallo a los mails trabados del remitente', async () => {
        const removeLabel = vi.fn().mockResolvedValue(undefined)
        const search = vi.fn().mockResolvedValue([
            { id: 'm1', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
            { id: 'm2', from: 'a@b.test', subject: 's', body: 'b', receivedAt: new Date() },
        ])

        const count = await retryFailedMails('a@b.test', { search, removeLabel, addLabel: vi.fn() })

        expect(search).toHaveBeenCalledWith('from:a@b.test label:mostro-failed')
        expect(removeLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(removeLabel).toHaveBeenCalledWith('m2', 'mostro-failed')
        expect(count).toBe(2)
    })

    it('devuelve cero cuando no hay nada trabado', async () => {
        const removeLabel = vi.fn()
        const count = await retryFailedMails('a@b.test', {
            search: vi.fn().mockResolvedValue([]),
            removeLabel,
            addLabel: vi.fn(),
        })

        expect(count).toBe(0)
        expect(removeLabel).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test src/mastra/lib/inbox/retry-failed-mails.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Implementar el helper**

`src/mastra/lib/inbox/retry-failed-mails.ts`:

```ts
import { FAILED_LABEL, gmailReader, type GmailReader } from './gmail-reader'

// Sacarles el label los devuelve al query del poller: el próximo ciclo los levanta.
// Lo que se deja etiquetado queda descartado para siempre, que es el comportamiento
// deseado para el ruido (publicidades, avisos generales del proveedor).
export async function retryFailedMails(sender: string, reader: GmailReader = gmailReader): Promise<number> {
    const messages = await reader.search(`from:${sender} label:${FAILED_LABEL}`)

    for (const message of messages) {
        await reader.removeLabel(message.id, FAILED_LABEL)
    }

    return messages.length
}
```

- [ ] **Step 4: Correr el test**

Run: `pnpm test src/mastra/lib/inbox/retry-failed-mails.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Escribir el test del tool**

`src/mastra/tools/diapers-retry-failed-mail-tool.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../business/identity', () => ({ getUserByResourceId: vi.fn() }))
vi.mock('../lib/inbox/retry-failed-mails', () => ({ retryFailedMails: vi.fn() }))

import { getUserByResourceId } from '../../business/identity'
import { retryFailedMails } from '../lib/inbox/retry-failed-mails'
import { retryDiapersFailedMailTool } from './diapers-retry-failed-mail-tool'

const admin = { email: 'admin@gmail.com', name: 'Admin', role: 'admin' as const, addedAt: 1 }

function run(resourceId = 'admin@gmail.com') {
    return (retryDiapersFailedMailTool as never as {
        execute: (input: unknown, context: unknown) => Promise<{ ok: boolean; retried?: number; error?: string }>
    }).execute({}, { agent: { resourceId } })
}

beforeEach(() => {
    vi.mocked(getUserByResourceId).mockResolvedValue(admin)
    vi.mocked(retryFailedMails).mockResolvedValue(2)
})

describe('retryDiapersFailedMailTool', () => {
    it('devuelve los mails a la cola cuando el llamador es admin', async () => {
        const result = await run()

        expect(result).toEqual({ ok: true, retried: 2 })
        expect(retryFailedMails).toHaveBeenCalledWith('panales@proveedor.test')
    })

    it('rechaza a los llamadores que no son admin', async () => {
        vi.mocked(getUserByResourceId).mockResolvedValue({ ...admin, role: 'member' })

        const result = await run()

        expect(result.ok).toBe(false)
        expect(result.error).toContain('admin')
        expect(retryFailedMails).not.toHaveBeenCalled()
    })

    it('rechaza cuando no hay identidad del llamador', async () => {
        const result = await (retryDiapersFailedMailTool as never as {
            execute: (input: unknown, context: unknown) => Promise<{ ok: boolean; error?: string }>
        }).execute({}, {})

        expect(result.ok).toBe(false)
        expect(retryFailedMails).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 6: Correr el test para verificar que falla**

Run: `pnpm test src/mastra/tools/diapers-retry-failed-mail-tool.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 7: Implementar los tres tools**

`src/mastra/tools/diapers-retry-failed-mail-tool.ts`:

```ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { getUserByResourceId } from '../../business/identity'
import { retryFailedMails } from '../lib/inbox/retry-failed-mails'

export const retryDiapersFailedMailTool = createTool({
    id: 'retry-diapers-failed-mail',
    description: 'Vuelve a poner en cola los mails del proveedor de pañales que no se pudieron procesar, para que el próximo ciclo los reintente. Solo los admins pueden usarlo. Reintentar sirve si el motivo del fallo ya se resolvió (por ejemplo, si faltaba abrir el pedido del mes).',
    inputSchema: z.object({}),
    outputSchema: z.object({
        ok: z.boolean(),
        retried: z.number().optional(),
        error: z.string().optional(),
    }),
    execute: async (_input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const caller = await getUserByResourceId(resourceId)
        if (!caller || caller.role !== 'admin') {
            return { ok: false, error: 'only admins can retry failed mails' }
        }
        return { ok: true, retried: await retryFailedMails(appConfig.DIAPERS_EMAIL_TO) }
    },
})
```

`src/mastra/tools/meds-retry-failed-mail-tool.ts` — idéntico salvo:

```ts
export const retryMedsFailedMailTool = createTool({
    id: 'retry-meds-failed-mail',
    description: 'Vuelve a poner en cola los mails de la farmacia que no se pudieron procesar, para que el próximo ciclo los reintente. Solo los admins pueden usarlo. Reintentar sirve si el motivo del fallo ya se resolvió (por ejemplo, si faltaba abrir el pedido del mes).',
```

y `retryFailedMails(appConfig.MEDS_EMAIL_TO)`.

`src/mastra/tools/refunds-retry-failed-mail-tool.ts` — idéntico salvo:

```ts
export const retryRefundsFailedMailTool = createTool({
    id: 'retry-refunds-failed-mail',
    description: 'Vuelve a poner en cola los mails del procesador de reembolsos que no se pudieron procesar, para que el próximo ciclo los reintente. Solo los admins pueden usarlo. Reintentar sirve si el motivo del fallo ya se resolvió (por ejemplo, si faltaba abrir el reembolso del mes).',
```

y `retryFailedMails(appConfig.REFUNDS_EMAIL_TO)`.

- [ ] **Step 8: Correr el test**

Run: `pnpm test src/mastra/tools/diapers-retry-failed-mail-tool.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Registrar los tools en sus agentes**

En `src/mastra/agents/diapers-agent.ts`, importar `retryDiapersFailedMailTool` y agregarlo al
objeto `tools`. Agregar a las instrucciones, dentro de la lista de responsabilidades:

```
- Si un mail del proveedor no se pudo procesar y el usuario pide reintentarlo, usá retryDiapersFailedMailTool. Si devuelve { ok: false, error: 'only admins can retry failed mails' }, explicale que solo un admin puede hacerlo.
```

Repetir en `meds-agent.ts` y `refunds-agent.ts` con sus tools correspondientes.

- [ ] **Step 10: Typecheck y commit**

Run: `pnpm run typecheck && pnpm test`
Expected: sin errores, todo verde.

```bash
git add src/mastra/lib/inbox/retry-failed-mails.ts src/mastra/lib/inbox/retry-failed-mails.test.ts src/mastra/tools/ src/mastra/agents/
git commit -m "feat: let admins requeue mails that failed to process"
```

---

### Task 9: Borrar las rutas de resume

El poller reemplaza los seis webhooks. Las funciones de `*-run.ts` quedan.

**Files:**
- Delete: `src/mastra/routes/webhook-diapers.route.ts`
- Delete: `src/mastra/routes/webhook-meds-ack.route.ts`
- Delete: `src/mastra/routes/webhook-meds-confirm.route.ts`
- Delete: `src/mastra/routes/webhook-refunds-ack.route.ts`
- Delete: `src/mastra/routes/webhook-refunds-confirmation.route.ts`
- Delete: `src/mastra/routes/webhook-refunds-deposit.route.ts`
- Delete: `src/mastra/routes/webhook-refunds-deposit.route.test.ts`
- Modify: `src/mastra/index.ts:18-22,28,52-61`

- [ ] **Step 1: Borrar las rutas y su test**

```bash
git rm src/mastra/routes/webhook-diapers.route.ts \
       src/mastra/routes/webhook-meds-ack.route.ts \
       src/mastra/routes/webhook-meds-confirm.route.ts \
       src/mastra/routes/webhook-refunds-ack.route.ts \
       src/mastra/routes/webhook-refunds-confirmation.route.ts \
       src/mastra/routes/webhook-refunds-deposit.route.ts \
       src/mastra/routes/webhook-refunds-deposit.route.test.ts
```

- [ ] **Step 2: Sacar los imports y el registro de `index.ts`**

Borrar los seis imports de `webhook-*.route` (líneas 18-22 y 28) y reemplazar el bloque
`server` por:

```ts
    server: {
        auth: createGoogleAuth(),
        cors: ngrokOrigin
            ? {
                origin: ngrokOrigin,
                credentials: true,
            }
            : undefined,
    },
```

El túnel de ngrok se mantiene: Telegram lo sigue necesitando.

- [ ] **Step 3: Verificar que no quedaron referencias**

Run: `grep -rn "webhook-" src/ --include=*.ts`
Expected: sin resultados.

Run: `pnpm run typecheck && pnpm test`
Expected: sin errores, todo verde.

- [ ] **Step 4: Commit**

```bash
git add -A src/mastra/routes src/mastra/index.ts
git commit -m "refactor: drop the resume webhooks now that polling replaces them"
```

---

### Task 10: Documentación y verificación final

**Files:**
- Modify: `README.md` (si documenta los webhooks)
- Modify: `.env.example` (si existe y menciona el scope)

- [ ] **Step 1: Buscar referencias a los webhooks en la documentación**

Run: `grep -rniI "webhook" README.md docs/ .env.example 2>/dev/null | grep -iv telegram`
Expected: revisar cada resultado. Los que describan las rutas de resume se reemplazan por
una descripción del polling; los de Telegram se dejan.

- [ ] **Step 2: Actualizar el README si corresponde**

Si el README describe el flujo de resume por HTTP, reemplazar esa sección por una que
explique que mostro lee su propia casilla cada 15 minutos y reanuda el workflow según el
step suspendido. El README va en inglés.

- [ ] **Step 3: Verificación completa**

Run: `pnpm test`
Expected: PASS, sin tests salteados.

Run: `pnpm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
# Solo los archivos de documentación que hayas tocado. No usar `git add -A`:
# hay cambios no relacionados en el working tree que no son de este plan.
git add README.md .env.example
git commit -m "docs: describe mailbox polling instead of resume webhooks"
```

---

## Después de implementar: pasos manuales

Estos no los hace el implementador, los hace Alex:

1. **Re-autorizar Gmail.** Correr `pnpm run gmail:auth` y reemplazar
   `GMAIL_MAILER_REFRESH_TOKEN` en el `.env` con el token nuevo. Sin esto el poller no puede
   leer nada — el envío sigue andando con el token viejo, así que el fallo se ve solo del
   lado del polling.

2. **Verificar el consent screen.** El scope `gmail.modify` es sensible. Si la app OAuth está
   en modo Testing, el refresh token muere a los 7 días (el mailer ya documenta esto en
   `gmail-mailer.ts:26`).

3. **Probar un ciclo a mano** antes de esperar al cron: abrir Studio, correr
   `diapers-poll` con input `{}`, y verificar que los labels aparecen en Gmail.
