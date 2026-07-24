# Gmail Outbound Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Mostro envíe los cuatro correos salientes desde su propia cuenta de Gmail vía la Gmail API, eliminando el mecanismo `*_MESSAGING_URL`.

**Architecture:** Un módulo `lib/mailer/` con tres piezas separadas: `mime.ts` (función pura que arma el mensaje RFC 2822 en base64url), `gmail-mailer.ts` (único punto que habla con Google, con reintentos y traducción de errores) y `templates/` (funciones puras que arman asunto y cuerpo por dominio). Los cuatro steps de salida llaman a `sendEmail` **antes** de avanzar el estado, de modo que un fallo de envío deja el workflow sin avanzar y el pedido se puede reintentar limpio.

**Tech Stack:** TypeScript ESM, Mastra 1.x, `@googleapis/gmail`, Zod 4, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-24-gmail-outbound-email-design.md`

## Global Constraints

- Gestor de paquetes: **pnpm** (`pnpm add`, `pnpm run`). Nunca npm.
- Indentación: 4 espacios en `src/mastra/**` (los tests existentes usan 2; respetar el estilo del archivo vecino).
- Los comentarios del código van en español, como el resto del repo.
- Mensajes de commit en inglés, sin co-autoría ni menciones a herramientas.
- Correr los tests con `pnpm test` (vitest en modo run).
- Typecheck con `pnpm exec tsc --noEmit`. No usar `mastra build` para verificar: falla con EBUSY sobre `mastra.duckdb` si hay un `dev` corriendo.
- Todo lo que toque `appConfig` depende de que las variables estén en `tests/setup-env.ts`, o toda la suite rompe.
- Timestamps del state: unix en **segundos** (`unixTimestampSchema`).
- Scope OAuth: `https://www.googleapis.com/auth/gmail.send`.
- Asunto de todos los correos: `[Mostro] <descripción> <YYYY-MM>`.

## File Structure

**Nuevos:**

| Archivo | Responsabilidad |
| --- | --- |
| `src/mastra/lib/mailer/mime.ts` | Armar el mensaje RFC 2822 y codificarlo en base64url |
| `src/mastra/lib/mailer/mime.test.ts` | Tests del anterior |
| `src/mastra/lib/mailer/gmail-mailer.ts` | `sendEmail()`: cliente OAuth2, reintentos, traducción de errores |
| `src/mastra/lib/mailer/gmail-mailer.test.ts` | Tests del anterior |
| `src/mastra/lib/mailer/templates/diapers.ts` | Plantilla del pedido de pañales |
| `src/mastra/lib/mailer/templates/meds.ts` | Plantilla del pedido de medicamentos |
| `src/mastra/lib/mailer/templates/refunds.ts` | Plantillas de solicitud de reintegro y de depósito confirmado |
| `src/mastra/lib/mailer/templates/templates.test.ts` | Tests de las cuatro plantillas |
| `scripts/gmail-authorize.mjs` | Script one-time para obtener el refresh token |

**Modificados:** `src/mastra/config/app.config.ts`, `src/mastra/lib/date-scope.ts`, los cuatro steps de salida, `src/mastra/lib/{diapers,meds,refunds}-run.ts`, `src/mastra/routes/webhook-refunds-deposit.route.ts`, `tests/setup-env.ts`, `package.json`, `.env.example`, `README.md`, `diapers-flow.md`.

---

### Task 1: Dependencia y configuración de entorno

Agrega las variables nuevas **sin quitar** las `*_MESSAGING_URL` todavía: los steps siguen usándolas hasta la Task 12, y quitarlas ahora rompe el typecheck.

**Files:**
- Modify: `package.json` (dependencias)
- Modify: `src/mastra/config/app.config.ts`
- Modify: `tests/setup-env.ts`
- Modify: `.env.example`
- Test: `src/mastra/config/app.config.test.ts` (crear)

**Interfaces:**
- Consumes: nada.
- Produces: `appConfig.GMAIL_CLIENT_ID`, `appConfig.GMAIL_CLIENT_SECRET`, `appConfig.GMAIL_REFRESH_TOKEN`, `appConfig.GMAIL_SENDER`, `appConfig.DIAPERS_EMAIL_TO`, `appConfig.MEDS_EMAIL_TO`, `appConfig.REFUNDS_EMAIL_TO` — todas `string` (requeridas, nunca `undefined`).

- [ ] **Step 1: Instalar la dependencia**

```bash
pnpm add @googleapis/gmail
```

- [ ] **Step 2: Escribir el test que falla**

Crear `src/mastra/config/app.config.test.ts`. El segundo test verifica el interop ESM/CJS del paquete recién instalado, que es la incógnita técnica más temprana del plan:

```ts
import { describe, it, expect } from 'vitest'
import { appConfig } from './app.config'
import { auth, gmail } from '@googleapis/gmail'

describe('appConfig', () => {
  it('exposes the required Gmail settings as strings', () => {
    expect(typeof appConfig.GMAIL_CLIENT_ID).toBe('string')
    expect(typeof appConfig.GMAIL_CLIENT_SECRET).toBe('string')
    expect(typeof appConfig.GMAIL_REFRESH_TOKEN).toBe('string')
    expect(typeof appConfig.GMAIL_SENDER).toBe('string')
  })

  it('exposes one recipient per domain', () => {
    expect(typeof appConfig.DIAPERS_EMAIL_TO).toBe('string')
    expect(typeof appConfig.MEDS_EMAIL_TO).toBe('string')
    expect(typeof appConfig.REFUNDS_EMAIL_TO).toBe('string')
  })
})

describe('@googleapis/gmail', () => {
  it('exposes auth.OAuth2 and the gmail factory as named ESM imports', () => {
    expect(typeof auth.OAuth2).toBe('function')
    expect(typeof gmail).toBe('function')
  })
})
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/config/app.config.test.ts`
Expected: FAIL. Los tests de `appConfig` fallan porque las propiedades no existen (`undefined`, no `'string'`).

Si el tercer test falla con un error de import (`does not provide an export named 'auth'`), el paquete no resuelve sus named exports en ESM: cambiar en **todos** los archivos que lo usen a `import gmailApi from '@googleapis/gmail'` y usar `gmailApi.auth.OAuth2` / `gmailApi.gmail(...)`. Anotarlo, porque afecta a la Task 4 y a la Task 11.

- [ ] **Step 4: Agregar las variables al schema**

En `src/mastra/config/app.config.ts`, dentro de `envSchema`, después de `GOOGLE_COOKIE_PASSWORD`:

```ts
    GMAIL_CLIENT_ID: z.string().min(1),
    GMAIL_CLIENT_SECRET: z.string().min(1),
    GMAIL_REFRESH_TOKEN: z.string().min(1),
    GMAIL_SENDER: z.string().min(3),
    DIAPERS_EMAIL_TO: z.string().min(3),
    MEDS_EMAIL_TO: z.string().min(3),
    REFUNDS_EMAIL_TO: z.string().min(3),
```

- [ ] **Step 5: Agregar las variables al setup de tests**

Al final de `tests/setup-env.ts`:

```ts
process.env.GMAIL_CLIENT_ID ??= 'test-client-id'
process.env.GMAIL_CLIENT_SECRET ??= 'test-client-secret'
process.env.GMAIL_REFRESH_TOKEN ??= 'test-refresh-token'
process.env.GMAIL_SENDER ??= 'mostro@gmail.com'
process.env.DIAPERS_EMAIL_TO ??= 'panales@proveedor.test'
process.env.MEDS_EMAIL_TO ??= 'farmacia@proveedor.test'
process.env.REFUNDS_EMAIL_TO ??= 'reintegros@proveedor.test'
```

- [ ] **Step 6: Documentar las variables en `.env.example`**

Agregar al final del archivo (dejando las `*_MESSAGING_URL` donde están; se van en la Task 12):

```
# Gmail (envío de correos salientes) — requeridas, el server no arranca sin ellas.
# El refresh token se obtiene con: pnpm run gmail:auth
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_SENDER=
DIAPERS_EMAIL_TO=
MEDS_EMAIL_TO=
REFUNDS_EMAIL_TO=
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `pnpm test`
Expected: PASS, la suite entera (no solo el archivo nuevo — si `setup-env.ts` quedó incompleto, rompe todo).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/mastra/config/app.config.ts src/mastra/config/app.config.test.ts tests/setup-env.ts .env.example
git commit -m "feat: add required Gmail settings to the environment schema"
```

---

### Task 2: Derivar el mes del runId

Los steps reciben `runId` (`diapers-2026-07`) en su contexto de ejecución, así que el mes del asunto sale de ahí sin tocar ningún schema de input.

**Files:**
- Modify: `src/mastra/lib/date-scope.ts`
- Test: `src/mastra/lib/date-scope.test.ts` (crear)

**Interfaces:**
- Consumes: nada.
- Produces: `yearMonthFromRunId(runId: string): string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/lib/date-scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { yearMonthFromRunId } from './date-scope'

describe('yearMonthFromRunId', () => {
  it('extracts the year-month from a domain run id', () => {
    expect(yearMonthFromRunId('diapers-2026-07')).toBe('2026-07')
    expect(yearMonthFromRunId('meds-2026-07')).toBe('2026-07')
    expect(yearMonthFromRunId('refunds-2026-12')).toBe('2026-12')
  })

  it('returns the run id unchanged when it has no domain prefix', () => {
    expect(yearMonthFromRunId('2026-07')).toBe('2026-07')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/lib/date-scope.test.ts`
Expected: FAIL con "yearMonthFromRunId is not a function" o error de import.

- [ ] **Step 3: Implementar**

Agregar al final de `src/mastra/lib/date-scope.ts`:

```ts
// Los runs son deterministas por dominio y mes: `diapers-2026-07`, `meds-2026-07`.
// El mes es todo lo que sigue al primer guion; si no hay prefijo, ya es un YYYY-MM.
export function yearMonthFromRunId(runId: string): string {
    const match = runId.match(/^[a-z]+-(\d{4}-\d{2})$/)
    return match ? match[1] : runId
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/lib/date-scope.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/date-scope.ts src/mastra/lib/date-scope.test.ts
git commit -m "feat: derive the scoped year-month from a workflow run id"
```

---

### Task 3: Constructor del mensaje MIME

La Gmail API no recibe `to`/`subject`/`body`: recibe un mensaje RFC 2822 completo codificado en base64url, en el campo `raw`.

**Files:**
- Create: `src/mastra/lib/mailer/mime.ts`
- Test: `src/mastra/lib/mailer/mime.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `buildRawMessage(params: { from: string; to: string; subject: string; text: string }): string` — devuelve el mensaje en base64url.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/lib/mailer/mime.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRawMessage } from './mime'

const params = {
  from: 'mostro@gmail.com',
  to: 'farmacia@proveedor.test',
  subject: 'Pedido de pañales',
  text: 'Talle: M\nSolicitado por: Ana',
}

function decode(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8')
}

describe('buildRawMessage', () => {
  it('encodes with the base64url alphabet and no padding', () => {
    const raw = buildRawMessage(params)
    expect(raw).not.toMatch(/[+/=]/)
  })

  it('includes the addressing headers and separates them from the body with a blank line', () => {
    const message = decode(buildRawMessage(params))
    expect(message).toContain('From: mostro@gmail.com\r\n')
    expect(message).toContain('To: farmacia@proveedor.test\r\n')
    expect(message).toContain('Content-Type: text/plain; charset=UTF-8\r\n')
    expect(message).toContain('\r\n\r\nTalle: M\nSolicitado por: Ana')
  })

  it('encodes the subject in RFC 2047 so accents survive', () => {
    const message = decode(buildRawMessage(params))
    const subjectLine = message.split('\r\n').find(line => line.startsWith('Subject: '))
    expect(subjectLine).toBeDefined()

    const encoded = subjectLine!.replace('Subject: =?UTF-8?B?', '').replace('?=', '')
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe('Pedido de pañales')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/lib/mailer/mime.test.ts`
Expected: FAIL, no se puede resolver `./mime`.

- [ ] **Step 3: Implementar**

Crear `src/mastra/lib/mailer/mime.ts`:

```ts
// La Gmail API recibe el mensaje entero (headers + cuerpo) en un solo campo `raw`,
// codificado en base64url. Esto lo arma.

// RFC 2047: los headers son ASCII, así que un asunto con acentos viaja codificado.
function encodeSubject(subject: string): string {
    return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

export function buildRawMessage({
    from,
    to,
    subject,
    text,
}: {
    from: string
    to: string
    subject: string
    text: string
}): string {
    const headers = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${encodeSubject(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
    ]

    const message = `${headers.join('\r\n')}\r\n\r\n${text}`
    return Buffer.from(message, 'utf8').toString('base64url')
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/lib/mailer/mime.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/mailer/mime.ts src/mastra/lib/mailer/mime.test.ts
git commit -m "feat: build RFC 2822 messages for the Gmail API"
```

---

### Task 4: El mailer

Único módulo que habla con Google. Reintenta solo lo que tiene sentido reintentar y traduce el error de credenciales a un mensaje con remedio.

**Files:**
- Create: `src/mastra/lib/mailer/gmail-mailer.ts`
- Test: `src/mastra/lib/mailer/gmail-mailer.test.ts`

**Interfaces:**
- Consumes: `buildRawMessage` (Task 3), `appConfig.GMAIL_*` (Task 1).
- Produces: `sendEmail(params: { to: string; subject: string; text: string }): Promise<void>` — resuelve si el correo salió; lanza `Error` si no.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/lib/mailer/gmail-mailer.test.ts`. Los reintentos usan fake timers para no esperar de verdad:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { send, setCredentials } = vi.hoisted(() => ({
  send: vi.fn(),
  setCredentials: vi.fn(),
}))

vi.mock('@googleapis/gmail', () => ({
  auth: {
    OAuth2: class {
      setCredentials = setCredentials
    },
  },
  gmail: () => ({ users: { messages: { send } } }),
}))

import { sendEmail } from './gmail-mailer'

const message = { to: 'farmacia@proveedor.test', subject: 'Pedido', text: 'Talle: M' }

// Un error con la forma que devuelve Gaxios (el cliente HTTP de googleapis).
function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { status })
}

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    send.mockResolvedValue({ data: { id: 'msg-1' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends the message as the authenticated account', async () => {
    await sendEmail(message)

    expect(send).toHaveBeenCalledTimes(1)
    const [args] = send.mock.calls[0]
    expect(args.userId).toBe('me')
    const decoded = Buffer.from(args.requestBody.raw, 'base64url').toString('utf8')
    expect(decoded).toContain('To: farmacia@proveedor.test')
    expect(decoded).toContain('Talle: M')
  })

  it('retries transient failures and succeeds', async () => {
    vi.useFakeTimers()
    send.mockRejectedValueOnce(httpError(503))
    send.mockRejectedValueOnce(httpError(429))
    send.mockResolvedValueOnce({ data: { id: 'msg-1' } })

    const pending = sendEmail(message)
    await vi.advanceTimersByTimeAsync(5000)
    await pending

    expect(send).toHaveBeenCalledTimes(3)
  })

  it('gives up after three attempts', async () => {
    vi.useFakeTimers()
    send.mockRejectedValue(httpError(503))

    const pending = sendEmail(message)
    const assertion = expect(pending).rejects.toThrow(/No se pudo enviar el correo/)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion

    expect(send).toHaveBeenCalledTimes(3)
  })

  it('does not retry client errors', async () => {
    send.mockRejectedValue(httpError(403))

    await expect(sendEmail(message)).rejects.toThrow(/No se pudo enviar el correo/)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('explains how to fix a revoked refresh token', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), {
        status: 400,
        response: { data: { error: 'invalid_grant' } },
      }),
    )

    await expect(sendEmail(message)).rejects.toThrow(/pnpm run gmail:auth/)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/lib/mailer/gmail-mailer.test.ts`
Expected: FAIL, no se puede resolver `./gmail-mailer`.

- [ ] **Step 3: Implementar**

Crear `src/mastra/lib/mailer/gmail-mailer.ts`:

```ts
import { auth, gmail } from '@googleapis/gmail'
import { appConfig } from '../../config/app.config'
import { buildRawMessage } from './mime'

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 500

let client: ReturnType<typeof gmail> | undefined

function getClient() {
    if (!client) {
        const oauth2 = new auth.OAuth2(appConfig.GMAIL_CLIENT_ID, appConfig.GMAIL_CLIENT_SECRET)
        // Con el refresh token alcanza: el SDK renueva el access token solo.
        oauth2.setCredentials({ refresh_token: appConfig.GMAIL_REFRESH_TOKEN })
        client = gmail({ version: 'v1', auth: oauth2 })
    }
    return client
}

function httpStatusOf(error: unknown): number | undefined {
    const candidate = error as { status?: number; response?: { status?: number } }
    return candidate?.response?.status ?? candidate?.status
}

// El refresh token se revocó, o la app OAuth quedó en modo Testing y el token murió a los 7 días.
function isInvalidGrant(error: unknown): boolean {
    const candidate = error as { message?: string; response?: { data?: { error?: string } } }
    return candidate?.response?.data?.error === 'invalid_grant'
        || (candidate?.message ?? '').includes('invalid_grant')
}

// Sin status HTTP = fallo de red o timeout, que sí conviene reintentar.
// Un 4xx no mejora esperando: token revocado, destinatario inválido, cuerpo mal armado.
function isRetryable(error: unknown): boolean {
    const status = httpStatusOf(error)
    if (status === undefined) return true
    if (status === 429) return true
    return status >= 500
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export async function sendEmail({
    to,
    subject,
    text,
}: {
    to: string
    subject: string
    text: string
}): Promise<void> {
    const raw = buildRawMessage({ from: appConfig.GMAIL_SENDER, to, subject, text })
    let lastError: unknown

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await getClient().users.messages.send({ userId: 'me', requestBody: { raw } })
            return
        } catch (error) {
            lastError = error

            if (isInvalidGrant(error)) {
                throw new Error(
                    'El refresh token de Gmail ya no es válido: regeneralo con `pnpm run gmail:auth` '
                    + 'y verificá que la app OAuth esté publicada en producción.',
                )
            }

            if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break

            await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
        }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError)
    throw new Error(`No se pudo enviar el correo a ${to}: ${detail}`)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/lib/mailer/gmail-mailer.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/mailer/gmail-mailer.ts src/mastra/lib/mailer/gmail-mailer.test.ts
git commit -m "feat: send email through the Gmail API with retries"
```

---

### Task 5: Las cuatro plantillas

Funciones puras. Ningún campo opcional ausente puede aparecer como el string `"undefined"` en el cuerpo: si falta, la línea no se escribe.

**Files:**
- Create: `src/mastra/lib/mailer/templates/diapers.ts`
- Create: `src/mastra/lib/mailer/templates/meds.ts`
- Create: `src/mastra/lib/mailer/templates/refunds.ts`
- Test: `src/mastra/lib/mailer/templates/templates.test.ts`

**Interfaces:**
- Consumes: `formatUnixDate` de `src/mastra/lib/unix-time.ts`.
- Produces, todas devolviendo `{ subject: string; text: string }`:
  - `diapersRequestEmail({ size: 'M' | 'G' | 'XG'; requestedBy: string; yearMonth: string })`
  - `medsRequestEmail({ medications: string[]; requestedBy: string; yearMonth: string })`
  - `refundRequestEmail({ amount: number; reason?: string; requestedBy: string; yearMonth: string })`
  - `depositConfirmedEmail({ depositAmount?: number; depositDate?: number; refundReference?: string; yearMonth: string })`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/lib/mailer/templates/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { diapersRequestEmail } from './diapers'
import { medsRequestEmail } from './meds'
import { refundRequestEmail, depositConfirmedEmail } from './refunds'

describe('diapersRequestEmail', () => {
  it('states the size, the requester and the scoped month', () => {
    const { subject, text } = diapersRequestEmail({ size: 'M', requestedBy: 'Ana', yearMonth: '2026-07' })
    expect(subject).toBe('[Mostro] Pedido de pañales 2026-07')
    expect(text).toContain('Talle: M')
    expect(text).toContain('Ana')
  })
})

describe('medsRequestEmail', () => {
  it('lists every medication', () => {
    const { subject, text } = medsRequestEmail({
      medications: ['Ibuprofeno 400mg', 'Amoxicilina 500mg'],
      requestedBy: 'Ana',
      yearMonth: '2026-07',
    })
    expect(subject).toBe('[Mostro] Pedido de medicamentos 2026-07')
    expect(text).toContain('- Ibuprofeno 400mg')
    expect(text).toContain('- Amoxicilina 500mg')
  })
})

describe('refundRequestEmail', () => {
  it('states the amount and the reason', () => {
    const { subject, text } = refundRequestEmail({
      amount: 15000,
      reason: 'Consulta pediátrica',
      requestedBy: 'Ana',
      yearMonth: '2026-07',
    })
    expect(subject).toBe('[Mostro] Solicitud de reintegro 2026-07')
    expect(text).toContain('15000')
    expect(text).toContain('Consulta pediátrica')
  })

  it('omits the reason line when there is no reason', () => {
    const { text } = refundRequestEmail({ amount: 15000, requestedBy: 'Ana', yearMonth: '2026-07' })
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('Motivo:')
  })
})

describe('depositConfirmedEmail', () => {
  it('states the deposited amount and its date as YYYY-MM-DD', () => {
    const { subject, text } = depositConfirmedEmail({
      depositAmount: 15000,
      depositDate: 1784000000,
      refundReference: 'REF-123',
      yearMonth: '2026-07',
    })
    expect(subject).toBe('[Mostro] Depósito confirmado 2026-07')
    expect(text).toContain('15000')
    expect(text).toContain('2026-07-13')
    expect(text).toContain('REF-123')
  })

  it('omits missing optional fields instead of printing undefined', () => {
    const { text } = depositConfirmedEmail({ yearMonth: '2026-07' })
    expect(text).not.toContain('undefined')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/lib/mailer/templates/templates.test.ts`
Expected: FAIL, no se pueden resolver los tres módulos.

- [ ] **Step 3: Implementar las plantillas**

Crear `src/mastra/lib/mailer/templates/diapers.ts`:

```ts
export function diapersRequestEmail({
    size,
    requestedBy,
    yearMonth,
}: {
    size: 'M' | 'G' | 'XG'
    requestedBy: string
    yearMonth: string
}): { subject: string; text: string } {
    return {
        subject: `[Mostro] Pedido de pañales ${yearMonth}`,
        text: [
            'Hola,',
            '',
            `Va el pedido de pañales correspondiente a ${yearMonth}.`,
            '',
            `Talle: ${size}`,
            `Solicitado por: ${requestedBy}`,
            '',
            'Gracias.',
        ].join('\n'),
    }
}
```

Crear `src/mastra/lib/mailer/templates/meds.ts`:

```ts
export function medsRequestEmail({
    medications,
    requestedBy,
    yearMonth,
}: {
    medications: string[]
    requestedBy: string
    yearMonth: string
}): { subject: string; text: string } {
    return {
        subject: `[Mostro] Pedido de medicamentos ${yearMonth}`,
        text: [
            'Hola,',
            '',
            `Va el pedido de medicamentos correspondiente a ${yearMonth}.`,
            '',
            'Medicamentos:',
            ...medications.map(medication => `- ${medication}`),
            '',
            `Solicitado por: ${requestedBy}`,
            '',
            'Gracias.',
        ].join('\n'),
    }
}
```

Crear `src/mastra/lib/mailer/templates/refunds.ts`:

```ts
import { formatUnixDate } from '../../unix-time'

export function refundRequestEmail({
    amount,
    reason,
    requestedBy,
    yearMonth,
}: {
    amount: number
    reason?: string
    requestedBy: string
    yearMonth: string
}): { subject: string; text: string } {
    const lines = [
        'Hola,',
        '',
        `Va una solicitud de reintegro correspondiente a ${yearMonth}.`,
        '',
        `Monto: ${amount}`,
    ]

    // Los campos opcionales se omiten: una línea "Motivo: undefined" es peor que no tenerla.
    if (reason) lines.push(`Motivo: ${reason}`)

    lines.push(`Solicitado por: ${requestedBy}`, '', 'Gracias.')

    return {
        subject: `[Mostro] Solicitud de reintegro ${yearMonth}`,
        text: lines.join('\n'),
    }
}

export function depositConfirmedEmail({
    depositAmount,
    depositDate,
    refundReference,
    yearMonth,
}: {
    depositAmount?: number
    depositDate?: number
    refundReference?: string
    yearMonth: string
}): { subject: string; text: string } {
    const lines = [
        'Hola,',
        '',
        `Confirmamos la recepción del depósito del reintegro ${yearMonth}.`,
        '',
    ]

    if (depositAmount !== undefined) lines.push(`Monto depositado: ${depositAmount}`)
    if (depositDate !== undefined) lines.push(`Fecha del depósito: ${formatUnixDate(depositDate)}`)
    if (refundReference) lines.push(`Referencia: ${refundReference}`)

    lines.push('', 'Gracias.')

    return {
        subject: `[Mostro] Depósito confirmado ${yearMonth}`,
        text: lines.join('\n'),
    }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/lib/mailer/templates/templates.test.ts`
Expected: PASS, 6 tests.

Si el test de la fecha falla, confirmar el valor esperado: `formatUnixDate(1784000000)` usa `toISOString()`, o sea UTC. Ajustar el string esperado del test al valor real, no la implementación.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/mailer/templates/
git commit -m "feat: add outbound email templates for the three domains"
```

---

### Task 6: Step `request-diapers`

Primer step convertido. Envía **antes** de avanzar el estado.

**Files:**
- Modify: `src/mastra/workflows/diapers/steps/request-diapers.step.ts`
- Test: `src/mastra/workflows/diapers/steps/request-diapers.step.test.ts` (crear)

**Interfaces:**
- Consumes: `sendEmail` (Task 4), `diapersRequestEmail` (Task 5), `yearMonthFromRunId` (Task 2), `appConfig.DIAPERS_EMAIL_TO` (Task 1).
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/workflows/diapers/steps/request-diapers.step.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../lib/mailer/gmail-mailer', () => ({
  sendEmail: vi.fn(),
}))

import { requestDiapers } from './request-diapers.step'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'

const setState = vi.fn()

function execute() {
  return (requestDiapers.execute as any)({
    inputData: { size: 'M', requestedBy: 'Ana' },
    state: { status: 'idle', requestedBy: 'Ana' },
    setState,
    runId: 'diapers-2026-07',
  })
}

describe('request-diapers step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the supplier with the size and the scoped month', async () => {
    await execute()

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'panales@proveedor.test',
      subject: '[Mostro] Pedido de pañales 2026-07',
      text: expect.stringContaining('Talle: M'),
    })
  })

  it('advances the state only after the email went out', async () => {
    await execute()

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'diapers_requested', size: 'M', requestedBy: 'Ana' }),
    )
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(execute()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/workflows/diapers/steps/request-diapers.step.test.ts`
Expected: FAIL. `sendEmail` no fue llamado (el step todavía hace `fetch`) y el tercer test falla porque `setState` sí se llamó.

- [ ] **Step 3: Implementar**

Reemplazar el cuerpo de `execute` en `src/mastra/workflows/diapers/steps/request-diapers.step.ts`. El archivo completo queda:

```ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { yearMonthFromRunId } from '../../../lib/date-scope'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'
import { diapersRequestEmail } from '../../../lib/mailer/templates/diapers'
import { nowUnix } from '../../../lib/unix-time'
import { diapersStateSchema } from '../schemas/diapers-state.schema'
import { requestDiapersInputSchema } from '../schemas/request-diapers-input.schema'

export const requestDiapers = createStep({
    id: 'request-diapers',
    inputSchema: requestDiapersInputSchema,
    outputSchema: z.object({}),
    stateSchema: diapersStateSchema,
    execute: async ({ inputData, state, setState, runId }) => {
        // Primero el correo: si falla, el estado no avanza y el pedido se puede reintentar limpio.
        const { subject, text } = diapersRequestEmail({
            size: inputData.size,
            requestedBy: inputData.requestedBy,
            yearMonth: yearMonthFromRunId(runId),
        })

        await sendEmail({ to: appConfig.DIAPERS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'diapers_requested',
            size: inputData.size,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        return {}
    },
})
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/workflows/diapers/steps/request-diapers.step.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/workflows/diapers/steps/
git commit -m "feat: email the diaper order to the supplier"
```

---

### Task 7: Step `request-meds`

Misma forma que la Task 6, con la lista de medicamentos.

**Files:**
- Modify: `src/mastra/workflows/meds/steps/request-meds.step.ts`
- Test: `src/mastra/workflows/meds/steps/request-meds.step.test.ts` (crear)

**Interfaces:**
- Consumes: `sendEmail` (Task 4), `medsRequestEmail` (Task 5), `yearMonthFromRunId` (Task 2), `appConfig.MEDS_EMAIL_TO` (Task 1).
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/workflows/meds/steps/request-meds.step.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../lib/mailer/gmail-mailer', () => ({
  sendEmail: vi.fn(),
}))

import { requestMedsStep } from './request-meds.step'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'

const setState = vi.fn()

function execute() {
  return (requestMedsStep.execute as any)({
    inputData: { medications: ['Ibuprofeno 400mg'], requestedBy: 'Ana' },
    state: { status: 'idle', requestedBy: 'Ana' },
    setState,
    runId: 'meds-2026-07',
  })
}

describe('request-meds step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the pharmacy with the medication list', async () => {
    await execute()

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'farmacia@proveedor.test',
      subject: '[Mostro] Pedido de medicamentos 2026-07',
      text: expect.stringContaining('- Ibuprofeno 400mg'),
    })
  })

  it('advances the state only after the email went out', async () => {
    await execute()

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'meds_requested', requestedBy: 'Ana' }),
    )
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(execute()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/workflows/meds/steps/request-meds.step.test.ts`
Expected: FAIL, `sendEmail` no fue llamado.

- [ ] **Step 3: Implementar**

`src/mastra/workflows/meds/steps/request-meds.step.ts` completo:

```ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { yearMonthFromRunId } from '../../../lib/date-scope'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'
import { medsRequestEmail } from '../../../lib/mailer/templates/meds'
import { nowUnix } from '../../../lib/unix-time'
import { medsStateSchema } from '../schemas/meds-state.schema'
import { medsWorkflowInputSchema } from '../schemas/meds-workflow-input.schema'

export const requestMedsStep = createStep({
    id: 'request-meds',
    inputSchema: medsWorkflowInputSchema,
    outputSchema: z.object({}),
    stateSchema: medsStateSchema,
    execute: async ({ inputData, state, setState, runId }) => {
        // Primero el correo: si falla, el estado no avanza y el pedido se puede reintentar limpio.
        const { subject, text } = medsRequestEmail({
            medications: inputData.medications,
            requestedBy: inputData.requestedBy,
            yearMonth: yearMonthFromRunId(runId),
        })

        await sendEmail({ to: appConfig.MEDS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'meds_requested',
            medications: inputData.medications,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        return {}
    },
})
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/workflows/meds/steps/request-meds.step.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/workflows/meds/steps/
git commit -m "feat: email the medication order to the pharmacy"
```

---

### Task 8: Steps de reintegros

Los dos steps del dominio en una sola tarea: comparten destinatario y plantilla.

**Files:**
- Modify: `src/mastra/workflows/refunds/steps/request-refund.step.ts`
- Modify: `src/mastra/workflows/refunds/steps/confirm-deposit.step.ts`
- Test: `src/mastra/workflows/refunds/steps/refunds-email.step.test.ts` (crear)

**Interfaces:**
- Consumes: `sendEmail` (Task 4), `refundRequestEmail` y `depositConfirmedEmail` (Task 5), `yearMonthFromRunId` (Task 2), `appConfig.REFUNDS_EMAIL_TO` (Task 1).
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/workflows/refunds/steps/refunds-email.step.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../lib/mailer/gmail-mailer', () => ({
  sendEmail: vi.fn(),
}))

import { requestRefundStep } from './request-refund.step'
import { confirmDepositStep } from './confirm-deposit.step'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'

const setState = vi.fn()

function executeRequest() {
  return (requestRefundStep.execute as any)({
    inputData: { amount: 15000, reason: 'Consulta pediátrica', requestedBy: 'Ana' },
    state: { status: 'idle', requestedBy: 'Ana' },
    setState,
    runId: 'refunds-2026-07',
  })
}

function executeConfirm() {
  return (confirmDepositStep.execute as any)({
    inputData: {},
    state: {
      status: 'deposit_received',
      requestedBy: 'Ana',
      depositAmount: 15000,
      depositDate: 1784000000,
      refundReference: 'REF-123',
    },
    setState,
    runId: 'refunds-2026-07',
  })
}

describe('request-refund step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the refund request with amount and reason', async () => {
    await executeRequest()

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'reintegros@proveedor.test',
      subject: '[Mostro] Solicitud de reintegro 2026-07',
      text: expect.stringContaining('Consulta pediátrica'),
    })
  })

  it('advances the state only after the email went out', async () => {
    await executeRequest()

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refund_requested', amount: 15000 }),
    )
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(executeRequest()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})

describe('confirm-deposit step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the deposit confirmation with its reference', async () => {
    await executeConfirm()

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'reintegros@proveedor.test',
      subject: '[Mostro] Depósito confirmado 2026-07',
      text: expect.stringContaining('REF-123'),
    })
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(executeConfirm()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/workflows/refunds/steps/refunds-email.step.test.ts`
Expected: FAIL, `sendEmail` no fue llamado en ninguno de los dos steps.

- [ ] **Step 3: Implementar `request-refund`**

`src/mastra/workflows/refunds/steps/request-refund.step.ts` completo:

```ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { yearMonthFromRunId } from '../../../lib/date-scope'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'
import { refundRequestEmail } from '../../../lib/mailer/templates/refunds'
import { nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'
import { requestRefundInputSchema } from '../schemas/request-refund-input.schema'

export const requestRefundStep = createStep({
    id: 'request-refund',
    inputSchema: requestRefundInputSchema,
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ inputData, state, setState, runId }) => {
        // Primero el correo: si falla, el estado no avanza y el pedido se puede reintentar limpio.
        const { subject, text } = refundRequestEmail({
            amount: inputData.amount,
            reason: inputData.reason,
            requestedBy: inputData.requestedBy,
            yearMonth: yearMonthFromRunId(runId),
        })

        await sendEmail({ to: appConfig.REFUNDS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'refund_requested',
            amount: inputData.amount,
            reason: inputData.reason,
            requestedBy: inputData.requestedBy,
            requestedAt: nowUnix(),
        })

        return {}
    },
})
```

- [ ] **Step 4: Implementar `confirm-deposit`**

`src/mastra/workflows/refunds/steps/confirm-deposit.step.ts` completo:

```ts
import { createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { appConfig } from '../../../config/app.config'
import { yearMonthFromRunId } from '../../../lib/date-scope'
import { sendEmail } from '../../../lib/mailer/gmail-mailer'
import { depositConfirmedEmail } from '../../../lib/mailer/templates/refunds'
import { nowUnix } from '../../../lib/unix-time'
import { refundsStateSchema } from '../schemas/refunds-state.schema'

export const confirmDepositStep = createStep({
    id: 'confirm-deposit',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    stateSchema: refundsStateSchema,
    execute: async ({ state, setState, runId }) => {
        const { subject, text } = depositConfirmedEmail({
            depositAmount: state.depositAmount,
            depositDate: state.depositDate,
            refundReference: state.refundReference,
            yearMonth: yearMonthFromRunId(runId),
        })

        await sendEmail({ to: appConfig.REFUNDS_EMAIL_TO, subject, text })

        await setState({
            ...state,
            status: 'deposit_confirmed',
            depositConfirmedAt: nowUnix(),
        })

        return {}
    },
})
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/workflows/refunds/steps/refunds-email.step.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/mastra/workflows/refunds/steps/
git commit -m "feat: email refund requests and deposit confirmations"
```

---

### Task 9: Traducir el fallo del run a una respuesta explícita

`run.start()` no lanza cuando un step falla: devuelve `{ status: 'failed', error }`. Hoy los helpers devuelven ese resultado crudo y el agente puede leerlo como éxito.

**Files:**
- Modify: `src/mastra/lib/diapers-run.ts:39-46`
- Modify: `src/mastra/lib/meds-run.ts:39-46`
- Modify: `src/mastra/lib/refunds-run.ts:39-46`
- Test: `src/mastra/lib/diapers-run.test.ts` (existente, agregar casos)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `startDiapers`, `startMedsOrder` y `startRefundRequest` devuelven, además de las formas actuales, `{ alreadyInProgress: false; ok: false; reason: 'send_failed'; message: string }` cuando el run falla, y agregan `ok: true` al resultado exitoso.

- [ ] **Step 1: Escribir el test que falla**

`src/mastra/lib/diapers-run.test.ts` ya existe y hoy solo cubre `confirmDiapersDate`. Su helper `buildMastra` mockea `resume`, no `start`, así que el bloque nuevo trae su propio builder. Agregar al final del archivo (4 espacios de indentación, como el resto), y sumar `startDiapers` al import de la línea 9:

```ts
function buildStartMastra(start: ReturnType<typeof vi.fn>) {
    const createRun = vi.fn().mockResolvedValue({ start })
    const workflow = {
        getWorkflowRunById: vi.fn().mockResolvedValue(null),
        createRun,
    }
    const mastra = { getWorkflow: vi.fn().mockReturnValue(workflow) }
    return mastra as never
}

describe('startDiapers', () => {
    it('reports send_failed when the run fails', async () => {
        const start = vi.fn().mockResolvedValue({
            status: 'failed',
            error: new Error('No se pudo enviar el correo'),
        })

        const result = await startDiapers(buildStartMastra(start), {
            size: 'M',
            requestedBy: 'Ana',
            yearMonth: '2026-07',
        })

        expect(result).toMatchObject({ ok: false, reason: 'send_failed' })
        expect((result as { message?: string }).message).toContain('No pude enviar')
    })

    it('reports ok when the run suspends waiting for the supplier', async () => {
        const start = vi.fn().mockResolvedValue({ status: 'suspended' })

        const result = await startDiapers(buildStartMastra(start), {
            size: 'M',
            requestedBy: 'Ana',
            yearMonth: '2026-07',
        })

        expect(result).toMatchObject({ ok: true, alreadyInProgress: false })
    })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/lib/diapers-run.test.ts`
Expected: FAIL. El helper devuelve `{ alreadyInProgress: false, result }`, sin `ok` ni `reason`.

- [ ] **Step 3: Implementar en los tres helpers**

En `src/mastra/lib/diapers-run.ts`, reemplazar el cierre de `startDiapers`:

```ts
    const run = await workflow.createRun({ runId })
    const result = await run.start({
        inputData: { size: input.size, requestedBy: input.requestedBy },
        initialState: { requestedBy: input.requestedBy },
    })

    // run.start() no lanza: un step que falla vuelve como status 'failed'. Sin esto,
    // el agente recibiría un objeto opaco y podría anunciar un pedido que nunca salió.
    if (result.status === 'failed') {
        return {
            alreadyInProgress: false as const,
            ok: false as const,
            reason: 'send_failed' as const,
            message: 'No pude enviar el pedido. Volvé a intentarlo en un rato.',
        }
    }

    return { alreadyInProgress: false as const, ok: true as const, result }
```

Aplicar el mismo bloque en `startMedsOrder` (`src/mastra/lib/meds-run.ts`) y en `startRefundRequest` (`src/mastra/lib/refunds-run.ts`), conservando en cada uno su propio `inputData` e `initialState`. Los mensajes:

- meds: `'No pude enviar el pedido de medicamentos. Volvé a intentarlo en un rato.'`
- refunds: `'No pude enviar la solicitud de reintegro. Volvé a intentarlo en un rato.'`

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm test`
Expected: PASS. La suite entera, para detectar tests existentes que asumieran la forma anterior del retorno.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/mastra/lib/
git commit -m "feat: surface failed runs as an explicit send_failed result"
```

---

### Task 10: El webhook de depósito responde 502 si el run falla

Hoy responde `200` sin mirar el status del run, así que un fallo de envío queda invisible para el sistema que llamó.

**Files:**
- Modify: `src/mastra/routes/webhook-refunds-deposit.route.ts:33`
- Test: `src/mastra/routes/webhook-refunds-deposit.route.test.ts` (crear)

**Interfaces:**
- Consumes: `receiveDeposit` de `src/mastra/lib/refunds-run.ts`, que devuelve `{ ok: true, result }` donde `result` es el resultado del `resume`.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/mastra/routes/webhook-refunds-deposit.route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/refunds-run', () => ({
  receiveDeposit: vi.fn(),
}))

import { webhookRefundsDepositRoute } from './webhook-refunds-deposit.route'
import { receiveDeposit } from '../lib/refunds-run'

const body = { yearMonth: '2026-07', depositAmount: 15000, depositDate: '2026-07-13' }

// Contexto Hono mínimo: solo lo que usa el handler.
function context() {
  const json = vi.fn((payload: unknown, status?: number) => ({ payload, status: status ?? 200 }))
  return {
    get: () => ({}),
    req: { json: async () => body },
    json,
  }
}

function callHandler(c: any) {
  return (webhookRefundsDepositRoute as any).handler(c)
}

describe('POST /webhooks/refunds/deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when the resumed run does not fail', async () => {
    vi.mocked(receiveDeposit).mockResolvedValue({ ok: true, result: { status: 'success' } } as any)

    const response: any = await callHandler(context())

    expect(response.status).toBe(200)
  })

  it('returns 502 when the resumed run failed', async () => {
    vi.mocked(receiveDeposit).mockResolvedValue({ ok: true, result: { status: 'failed' } } as any)

    const response: any = await callHandler(context())

    expect(response.status).toBe(502)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test src/mastra/routes/webhook-refunds-deposit.route.test.ts`
Expected: FAIL en el segundo caso: devuelve 200 donde se espera 502.

Si falla por `handler is not a function`, `registerApiRoute` no expone el handler en esta versión: en ese caso extraer el cuerpo del handler a una función exportada `handleDepositWebhook(mastra, body)` en el mismo archivo, testear esa función y dejar el handler como una llamada de una línea.

- [ ] **Step 3: Implementar**

En `src/mastra/routes/webhook-refunds-deposit.route.ts`, reemplazar la última línea del handler (`return c.json({ ok: true }, 200)`) por:

```ts
            // El resume no lanza cuando un step falla: hay que mirar el status para que
            // el sistema externo pueda reintentar en vez de darlo por recibido.
            if (result.result?.status === 'failed') {
                return c.json({ ok: false, error: 'workflow failed' }, 502)
            }

            return c.json({ ok: true }, 200)
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test src/mastra/routes/webhook-refunds-deposit.route.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/routes/
git commit -m "fix: fail the deposit webhook when the resumed run fails"
```

---

### Task 11: Script de autorización one-time

Obtiene el refresh token. Va en JavaScript plano (`.mjs`) para no depender de un runner de TypeScript, y usa `--env-file` para leer el `.env`, que fuera de `mastra dev` no se carga solo.

**Files:**
- Create: `scripts/gmail-authorize.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET` del `.env`.
- Produces: el comando `pnpm run gmail:auth`, que imprime el valor de `GMAIL_REFRESH_TOKEN`.

- [ ] **Step 1: Escribir el script**

Crear `scripts/gmail-authorize.mjs`:

```js
// Script one-time: obtiene el refresh token de la cuenta de Gmail de Mostro.
// Uso: pnpm run gmail:auth
import http from 'node:http'
import { auth } from '@googleapis/gmail'

const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'

const clientId = process.env.GMAIL_CLIENT_ID
const clientSecret = process.env.GMAIL_CLIENT_SECRET

if (!clientId || !clientSecret) {
    console.error('Faltan GMAIL_CLIENT_ID y/o GMAIL_CLIENT_SECRET en el .env')
    process.exit(1)
}

const oauth2 = new auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

// prompt: 'consent' fuerza que Google devuelva un refresh token aunque la cuenta
// ya haya autorizado la app antes.
const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SCOPE],
})

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)

    if (url.pathname !== '/oauth2callback') {
        res.writeHead(404)
        res.end()
        return
    }

    const code = url.searchParams.get('code')

    if (!code) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Faltó el parámetro code.')
        return
    }

    try {
        const { tokens } = await oauth2.getToken(code)
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Listo. Volvé a la terminal.')

        if (tokens.refresh_token) {
            console.log('\nPegá esto en tu .env:\n')
            console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`)
        } else {
            console.error('\nGoogle no devolvió refresh token. Revocá el acceso de la app en')
            console.error('https://myaccount.google.com/permissions y volvé a correr el script.')
        }
    } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Falló el intercambio del code.')
        console.error(error)
    } finally {
        server.close()
    }
})

server.listen(PORT, () => {
    console.log('Abrí esta URL con la cuenta de Gmail de Mostro:\n')
    console.log(authUrl)
    console.log('\nEsperando el callback...')
})
```

- [ ] **Step 2: Agregar el script a `package.json`**

En `"scripts"`:

```json
    "gmail:auth": "node --env-file=.env scripts/gmail-authorize.mjs"
```

- [ ] **Step 3: Verificar que el script arranca**

Run: `pnpm run gmail:auth`
Expected: imprime una URL de `accounts.google.com` con `scope=...gmail.send` y queda esperando el callback. Cortar con Ctrl+C.

Si el `.env` todavía no tiene `GMAIL_CLIENT_ID`, el script sale con el mensaje de error: eso también es una verificación válida de este paso.

- [ ] **Step 4: Commit**

```bash
git add scripts/gmail-authorize.mjs package.json
git commit -m "feat: add a one-time script to obtain the Gmail refresh token"
```

---

### Task 12: Eliminar `*_MESSAGING_URL` y actualizar la documentación

Recién ahora: ningún step las usa.

**Files:**
- Modify: `src/mastra/config/app.config.ts:19-21`
- Modify: `.env.example:33-35`
- Modify: `README.md:65-73,131-137`
- Modify: `diapers-flow.md:17`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Verificar que nada en `src/` las usa**

Run: `grep -rn "MESSAGING_URL" src/`
Expected: sin resultados. Si aparece alguno, ese step quedó sin migrar: volver a la tarea correspondiente antes de seguir.

- [ ] **Step 2: Quitarlas del schema**

Borrar de `src/mastra/config/app.config.ts` las tres líneas:

```ts
    DIAPERS_MESSAGING_URL: z.string().min(1).optional(),
    MEDS_MESSAGING_URL: z.string().min(1).optional(),
    REFUNDS_MESSAGING_URL: z.string().min(1).optional(),
```

- [ ] **Step 3: Quitarlas de `.env.example`**

Borrar las tres líneas comentadas (`# DIAPERS_MESSAGING_URL=` y sus dos hermanas).

- [ ] **Step 4: Actualizar el README**

Reemplazar el bloque "Optional — external provider endpoints for outbound messaging" y sus tres variables por:

```markdown
   Required — Gmail, para el envío de correos salientes:

   ```env
   GMAIL_CLIENT_ID=
   GMAIL_CLIENT_SECRET=
   GMAIL_REFRESH_TOKEN=
   GMAIL_SENDER=
   DIAPERS_EMAIL_TO=
   MEDS_EMAIL_TO=
   REFUNDS_EMAIL_TO=
   ```

   Setup de la cuenta de Gmail, una sola vez:

   1. Crear un proyecto de Google Cloud propio del mailer, separado del que usa el SSO.
   2. Habilitar la Gmail API.
   3. Crear un cliente OAuth de tipo "Web application" con redirect a
      `http://localhost:53682/oauth2callback` (la URI debe coincidir exactamente, puerto incluido).
   4. Agregar el scope `https://www.googleapis.com/auth/gmail.send`.
   5. **Publicar la app en producción.** En modo *Testing* el refresh token se invalida a los 7
      días y los envíos empiezan a fallar. Al autorizar aparece la pantalla de "app no
      verificada", que se acepta manualmente.
   6. Correr `pnpm run gmail:auth` con la cuenta de Mostro y guardar el token en el `.env`.
```

En la sección "Tech Stack", agregar:

```markdown
- **[Gmail API](https://developers.google.com/gmail/api)** vía `@googleapis/gmail` — envío de correos salientes
```

En la tabla de "Scripts", agregar la fila:

```markdown
| `pnpm run gmail:auth` | Obtiene el refresh token de Gmail (one-time) |
```

- [ ] **Step 5: Actualizar el diagrama de `diapers-flow.md`**

En la línea 17, reemplazar el participante:

```
participant "DIAPERS_MESSAGING_URL\n(proveedor externo)" as Provider
```

por:

```
participant "DIAPERS_EMAIL_TO\n(proveedor externo, por correo)" as Provider
```

Revisar el resto del archivo: cualquier flecha que diga "POST" hacia `Provider` pasa a decir "correo".

- [ ] **Step 6: Verificación completa**

Run: `pnpm test`
Expected: PASS, toda la suite.

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

Run: `grep -rn "MESSAGING_URL" src/ README.md .env.example diapers-flow.md`
Expected: sin resultados.

- [ ] **Step 7: Commit**

```bash
git add src/mastra/config/app.config.ts .env.example README.md diapers-flow.md
git commit -m "refactor: drop the external messaging URL mechanism"
```

---

## Verificación manual final

Después de la Task 12, una vez, con credenciales reales:

1. Completar el `.env` con las siete variables (ver el setup del README).
2. `pnpm run dev` — el server debe arrancar; si falta una variable, falla en el boot con el error de zod, que es el comportamiento esperado.
3. Poner temporalmente el propio `GMAIL_SENDER` como `DIAPERS_EMAIL_TO` y pedir pañales por Telegram.
4. Confirmar que el correo llega, que el asunto muestra los acentos bien (`Pedido de pañales`, no `Pedido de paÃ±ales`) y que el `From` es la cuenta de Mostro.
5. Restaurar el destinatario real.
