# User Identity (telegram-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grupo cerrado con invitaciones: solo usuarios registrados pueden usar el bot de Telegram (desconocidos ignorados en silencio salvo deep link `/start CODIGO`), con roles admin/member y autoría (`requestedBy`) en los flujos compartidos.

**Architecture:** La identidad canónica es el ID de Telegram (spec: `docs/superpowers/specs/2026-07-21-user-identity-design.md`). Dos colecciones propias (`users`, `invites`) en el mismo MongoDB del storage, accedidas con el driver oficial vía un cliente singleton. Un `ChannelHandler` (`onDirectMessage`) en el `mostroSupervisor` actúa de gate antes de que el mensaje llegue al agente. Dos tools nuevas en el supervisor (`createInviteTool` admin-only, `setMyNameTool`). Los flujos diapers/refunds reciben `requestedBy` por input del workflow; meds lo recibe por resume de `wait-prescriptions`.

**Tech Stack:** Mastra `@mastra/core@^1.48` (channels handlers), driver `mongodb`, `zod@4`, `vitest` (nuevo), pnpm.

## Global Constraints

- Gestor de paquetes: **pnpm** (nunca npm).
- Mensajes de commit: **en inglés**, sin trailer de co-autoría, sin mencionar Claude/Anthropic ni jerga interna.
- Fechas siempre como **unix timestamps** (helper existente `nowUnix()` de `src/mastra/lib/unix-time.ts`).
- Estilo en `src/mastra/lib/` y `src/mastra/tools/`: 4 espacios, comillas simples, sin punto y coma (igual que los archivos vecinos).
- No usar `import.meta.url` ni rutas relativas al módulo para archivos propios (gotcha del bundler de `mastra dev`; ver nota en `diapers-subscribers.ts`).
- Agentes, tools, workflows y scorers se registran según el patrón existente: agentes/workflows en `src/mastra/index.ts`, tools adjuntas al agente que las usa.
- ES2022 modules (`"type": "module"`); tsconfig ya configurado, no tocarlo.
- Typecheck: `npx tsc --noEmit`. Tests: `pnpm test` (vitest, se configura en Task 1).
- El spec manda: si algo acá contradice al spec, gana el spec.

---

### Task 1: Dependencias, config y arnés de tests

**Files:**
- Modify: `package.json` (script `test`)
- Create: `vitest.config.ts`
- Create: `tests/setup-env.ts`
- Modify: `src/mastra/config/app.config.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nada previo.
- Produces: `appConfig.ADMIN_TELEGRAM_ID?: string`, `appConfig.ADMIN_NAME?: string`; comando `pnpm test` funcional; env dummy para tests (los módulos que importan `app.config` no explotan en vitest).

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add mongodb
pnpm add -D vitest
```

- [ ] **Step 2: Script de test en package.json**

En `package.json`, reemplazar el script `test`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Crear vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        setupFiles: ['./tests/setup-env.ts'],
        passWithNoTests: true,
    },
})
```

- [ ] **Step 4: Crear tests/setup-env.ts**

`src/mastra/config/app.config.ts` parsea `process.env` al importarse; sin estos dummies, cualquier test que importe (transitivamente) la config revienta:

```ts
process.env.MONGODB_URI ??= 'mongodb://localhost:27017'
process.env.MONGODB_DB_NAME ??= 'mostro-test'
process.env.OPENROUTER_API_KEY ??= 'test-key'
process.env.TELEGRAM_BOT_USERNAME ??= 'mostro_test_bot'
process.env.TELEGRAM_BOT_TOKEN ??= 'test-token'
process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN ??= 'test-secret'
```

- [ ] **Step 5: Agregar vars de admin a app.config.ts**

En `src/mastra/config/app.config.ts`, dentro de `envSchema`, después de `TELEGRAM_WEBHOOK_SECRET_TOKEN`:

```ts
    ADMIN_TELEGRAM_ID: z.string().min(1).optional(),
    ADMIN_NAME: z.string().min(1).optional(),
```

Opcionales a propósito: sin `ADMIN_TELEGRAM_ID` el sistema arranca igual y solo se saltea el seed (con warning).

- [ ] **Step 6: Actualizar .env.example**

Agregar al final de `.env.example` (las de Mongo faltan hoy y son requeridas por la config):

```
MONGODB_URI=
MONGODB_DB_NAME=
ADMIN_TELEGRAM_ID=
ADMIN_NAME=
```

- [ ] **Step 7: Verificar**

```bash
npx tsc --noEmit
pnpm test
```

Expected: tsc sin errores; vitest termina OK con "no test files found" (passWithNoTests).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/setup-env.ts src/mastra/config/app.config.ts .env.example
git commit -m "chore: add mongodb driver, vitest harness and admin env vars"
```

---

### Task 2: Cliente Mongo y repositorio de users

**Files:**
- Create: `src/mastra/lib/mongo-client.ts`
- Create: `src/mastra/lib/users.ts`
- Test: `tests/users.test.ts`

**Interfaces:**
- Consumes: `appConfig` (Task 1), `nowUnix()` de `src/mastra/lib/unix-time.ts`.
- Produces:
  - `getDb(): Promise<Db>` (mongo-client)
  - `type User = { telegramId: string; name: string; role: 'admin' | 'member'; addedAt: number }`
  - `telegramIdFromResourceId(resourceId: string): string | null`
  - `getUserByTelegramId(telegramId: string): Promise<User | null>`
  - `getUserByResourceId(resourceId: string): Promise<User | null>`
  - `createUser(user: User): Promise<void>` (upsert por telegramId, no pisa existentes)
  - `setUserName(telegramId: string, name: string): Promise<boolean>`
  - `ensureAdminSeed(): Promise<void>`

- [ ] **Step 1: Test que falla para el parser de resourceId**

Crear `tests/users.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { telegramIdFromResourceId } from '../src/mastra/lib/users'

describe('telegramIdFromResourceId', () => {
    it('extrae el id de un resourceId de telegram', () => {
        expect(telegramIdFromResourceId('telegram:5551234')).toBe('5551234')
    })

    it('devuelve null para otros providers', () => {
        expect(telegramIdFromResourceId('slack:U123')).toBeNull()
    })

    it('devuelve null para strings sin prefijo', () => {
        expect(telegramIdFromResourceId('5551234')).toBeNull()
    })

    it('devuelve null para telegram: vacío', () => {
        expect(telegramIdFromResourceId('telegram:')).toBeNull()
    })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../src/mastra/lib/users'` (o similar).

- [ ] **Step 3: Crear mongo-client.ts**

`src/mastra/lib/mongo-client.ts` — cliente singleton lazy (servidor long-running, un solo pool):

```ts
import { MongoClient, type Db } from 'mongodb'
import { appConfig } from '../config/app.config'

let client: MongoClient | null = null

export async function getDb(): Promise<Db> {
    if (!client) {
        client = new MongoClient(appConfig.MONGODB_URI)
        await client.connect()
    }
    return client.db(appConfig.MONGODB_DB_NAME)
}
```

- [ ] **Step 4: Crear users.ts**

`src/mastra/lib/users.ts`:

```ts
import type { Collection } from 'mongodb'
import { appConfig } from '../config/app.config'
import { getDb } from './mongo-client'
import { nowUnix } from './unix-time'

export type UserRole = 'admin' | 'member'

export type User = {
    telegramId: string
    name: string
    role: UserRole
    addedAt: number
}

async function usersCollection(): Promise<Collection<User>> {
    const db = await getDb()
    return db.collection<User>('users')
}

export function telegramIdFromResourceId(resourceId: string): string | null {
    const match = /^telegram:(.+)$/.exec(resourceId)
    return match ? match[1] : null
}

export async function getUserByTelegramId(telegramId: string): Promise<User | null> {
    const col = await usersCollection()
    return col.findOne({ telegramId }, { projection: { _id: 0 } })
}

export async function getUserByResourceId(resourceId: string): Promise<User | null> {
    const telegramId = telegramIdFromResourceId(resourceId)
    if (!telegramId) return null
    return getUserByTelegramId(telegramId)
}

// Upsert por telegramId: si ya existe, no pisa nada ($setOnInsert)
export async function createUser(user: User): Promise<void> {
    const col = await usersCollection()
    await col.updateOne(
        { telegramId: user.telegramId },
        { $setOnInsert: user },
        { upsert: true },
    )
}

export async function setUserName(telegramId: string, name: string): Promise<boolean> {
    const col = await usersCollection()
    const result = await col.updateOne({ telegramId }, { $set: { name } })
    return result.matchedCount > 0
}

export async function ensureAdminSeed(): Promise<void> {
    const adminId = appConfig.ADMIN_TELEGRAM_ID
    if (!adminId) {
        console.warn('[users] ADMIN_TELEGRAM_ID not set, skipping admin seed')
        return
    }
    await createUser({
        telegramId: adminId,
        name: appConfig.ADMIN_NAME ?? 'Admin',
        role: 'admin',
        addedAt: nowUnix(),
    })
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `pnpm test` y `npx tsc --noEmit`
Expected: 4 tests PASS; tsc sin errores. (Las funciones de Mongo son wrappers finos: se verifican manualmente en Task 6; no escribir tests que requieran una DB viva.)

- [ ] **Step 6: Commit**

```bash
git add src/mastra/lib/mongo-client.ts src/mastra/lib/users.ts tests/users.test.ts
git commit -m "feat: users repository backed by mongodb with admin seed"
```

---

### Task 3: Repositorio de invites

**Files:**
- Create: `src/mastra/lib/invites.ts`
- Test: `tests/invites.test.ts`

**Interfaces:**
- Consumes: `getDb()` (Task 2), `nowUnix()`.
- Produces:
  - `type Invite = { code: string; createdBy: string; createdAt: number; expiresAt: number; usedBy?: string }`
  - `INVITE_TTL_SECONDS` (7 días)
  - `generateInviteCode(): string` (URL-safe, apto deep link)
  - `createInvite(createdBy: string): Promise<Invite>`
  - `redeemInvite(code: string, telegramId: string): Promise<Invite | null>` — canje **atómico**: solo si no está usado y no venció; null si inválido.

- [ ] **Step 1: Test que falla para el generador de códigos**

Crear `tests/invites.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateInviteCode } from '../src/mastra/lib/invites'

describe('generateInviteCode', () => {
    it('genera códigos URL-safe (aptos para t.me/bot?start=CODE)', () => {
        for (let i = 0; i < 50; i++) {
            expect(generateInviteCode()).toMatch(/^[A-Za-z0-9_-]{12}$/)
        }
    })

    it('no repite códigos', () => {
        const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
        expect(codes.size).toBe(100)
    })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm test`
Expected: FAIL — módulo `invites` inexistente.

- [ ] **Step 3: Crear invites.ts**

`src/mastra/lib/invites.ts`:

```ts
import { randomBytes } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getDb } from './mongo-client'
import { nowUnix } from './unix-time'

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60

export type Invite = {
    code: string
    createdBy: string
    createdAt: number
    expiresAt: number
    usedBy?: string
}

async function invitesCollection(): Promise<Collection<Invite>> {
    const db = await getDb()
    return db.collection<Invite>('invites')
}

export function generateInviteCode(): string {
    return randomBytes(9).toString('base64url')
}

export async function createInvite(createdBy: string): Promise<Invite> {
    const now = nowUnix()
    const invite: Invite = {
        code: generateInviteCode(),
        createdBy,
        createdAt: now,
        expiresAt: now + INVITE_TTL_SECONDS,
    }
    const col = await invitesCollection()
    await col.insertOne(invite)
    return invite
}

// Canje atómico: matchea solo invites sin usar y vigentes, y los marca usados
// en la misma operación (dos canjes concurrentes: uno gana, el otro recibe null)
export async function redeemInvite(code: string, telegramId: string): Promise<Invite | null> {
    const col = await invitesCollection()
    return col.findOneAndUpdate(
        { code, usedBy: { $exists: false }, expiresAt: { $gt: nowUnix() } },
        { $set: { usedBy: telegramId } },
        { returnDocument: 'after' },
    )
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm test` y `npx tsc --noEmit`
Expected: tests de users + invites PASS; tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/invites.ts tests/invites.test.ts
git commit -m "feat: single-use invites repository with atomic redemption"
```

---

### Task 4: Gate de Telegram

**Files:**
- Create: `src/mastra/lib/telegram-gate.ts`
- Test: `tests/telegram-gate.test.ts`

**Interfaces:**
- Consumes: `User`, `getUserByTelegramId`, `createUser` (Task 2); `Invite`, `redeemInvite` (Task 3); `nowUnix()`; tipo `ChannelHandler` de `@mastra/core/channels`.
- Produces:
  - `parseStartCode(text: string | undefined): string | null`
  - `type TelegramGateDeps = { getUserByTelegramId, redeemInvite, createUser }` (mismas firmas que los repos)
  - `createTelegramGate(deps?: TelegramGateDeps): ChannelHandler` — deps inyectables para tests; default: repos reales.

Comportamiento (del spec §2): registrado → `defaultHandler`; desconocido con `/start CODIGO` válido → crea user member (name vacío), marca invite usado y pasa a `defaultHandler` (el agente da la bienvenida); desconocido con cualquier otra cosa → silencio (return sin llamar `defaultHandler`).

- [ ] **Step 1: Tests que fallan**

Crear `tests/telegram-gate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createTelegramGate, parseStartCode, type TelegramGateDeps } from '../src/mastra/lib/telegram-gate'
import type { User } from '../src/mastra/lib/users'
import type { Invite } from '../src/mastra/lib/invites'

describe('parseStartCode', () => {
    it('extrae el código de /start CODE', () => {
        expect(parseStartCode('/start abc123XYZ_-9')).toBe('abc123XYZ_-9')
    })

    it('tolera espacios alrededor', () => {
        expect(parseStartCode('  /start abc123XYZ_-9  ')).toBe('abc123XYZ_-9')
    })

    it('rechaza /start sin código', () => {
        expect(parseStartCode('/start')).toBeNull()
    })

    it('rechaza códigos con caracteres no URL-safe', () => {
        expect(parseStartCode('/start abc$123')).toBeNull()
    })

    it('rechaza texto común', () => {
        expect(parseStartCode('hola, quiero pañales')).toBeNull()
    })

    it('rechaza undefined', () => {
        expect(parseStartCode(undefined)).toBeNull()
    })
})

const member: User = { telegramId: '111', name: 'Ana', role: 'member', addedAt: 1 }
const validInvite: Invite = { code: 'abc123XYZ_-9', createdBy: '999', createdAt: 1, expiresAt: 2, usedBy: '222' }

function makeDeps(overrides: Partial<TelegramGateDeps> = {}): TelegramGateDeps {
    return {
        getUserByTelegramId: vi.fn(async () => null),
        redeemInvite: vi.fn(async () => null),
        createUser: vi.fn(async () => {}),
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
        await createTelegramGate(deps)(thread, makeMessage('111', 'hola'), defaultHandler)
        expect(defaultHandler).toHaveBeenCalledOnce()
        expect(deps.redeemInvite).not.toHaveBeenCalled()
    })

    it('desconocido con texto común es ignorado en silencio', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', 'hola'), defaultHandler)
        expect(defaultHandler).not.toHaveBeenCalled()
        expect(deps.redeemInvite).not.toHaveBeenCalled()
        expect(deps.createUser).not.toHaveBeenCalled()
    })

    it('desconocido con código válido queda registrado como member y pasa al agente', async () => {
        const deps = makeDeps({ redeemInvite: vi.fn(async () => validInvite) })
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', '/start abc123XYZ_-9'), defaultHandler)
        expect(deps.redeemInvite).toHaveBeenCalledWith('abc123XYZ_-9', '222')
        expect(deps.createUser).toHaveBeenCalledWith(expect.objectContaining({
            telegramId: '222',
            role: 'member',
        }))
        expect(defaultHandler).toHaveBeenCalledOnce()
    })

    it('desconocido con código inválido/vencido/usado es ignorado (redeem devuelve null)', async () => {
        const deps = makeDeps()
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('222', '/start abc123XYZ_-9'), defaultHandler)
        expect(deps.createUser).not.toHaveBeenCalled()
        expect(defaultHandler).not.toHaveBeenCalled()
    })

    it('registrado que manda /start va por flujo normal sin canjear', async () => {
        const deps = makeDeps({ getUserByTelegramId: vi.fn(async () => member) })
        const defaultHandler = vi.fn(async () => {})
        await createTelegramGate(deps)(thread, makeMessage('111', '/start abc123XYZ_-9'), defaultHandler)
        expect(defaultHandler).toHaveBeenCalledOnce()
        expect(deps.redeemInvite).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `pnpm test`
Expected: FAIL — módulo `telegram-gate` inexistente.

- [ ] **Step 3: Crear telegram-gate.ts**

`src/mastra/lib/telegram-gate.ts`:

```ts
import type { ChannelHandler } from '@mastra/core/channels'
import { createUser, getUserByTelegramId, type User } from './users'
import { redeemInvite, type Invite } from './invites'
import { nowUnix } from './unix-time'

export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<User | null>
    redeemInvite: (code: string, telegramId: string) => Promise<Invite | null>
    createUser: (user: User) => Promise<void>
}

const defaultDeps: TelegramGateDeps = { getUserByTelegramId, redeemInvite, createUser }

export function parseStartCode(text: string | undefined): string | null {
    if (!text) return null
    const match = /^\/start\s+([A-Za-z0-9_-]{6,})$/.exec(text.trim())
    return match ? match[1] : null
}

// Gate de acceso: corre antes de que el mensaje llegue al agente, así un
// desconocido no gasta tokens ni toca memoria
export function createTelegramGate(deps: TelegramGateDeps = defaultDeps): ChannelHandler {
    return async (thread, message, defaultHandler) => {
        const senderId = message.author.userId
        const known = await deps.getUserByTelegramId(senderId)
        if (known) {
            await defaultHandler(thread, message)
            return
        }

        const code = parseStartCode(message.text)
        if (!code) return

        const invite = await deps.redeemInvite(code, senderId)
        if (!invite) return

        await deps.createUser({ telegramId: senderId, name: '', role: 'member', addedAt: nowUnix() })
        await defaultHandler(thread, message)
    }
}
```

Nota: si `tsc` reprocha `message.text` o `message.author.userId`, revisar los tipos reales de `Thread`/`Message` en el paquete `chat` (los importa `@mastra/core/channels`); la doc embebida de Mastra usa exactamente esas propiedades.

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm test` y `npx tsc --noEmit`
Expected: todos los tests PASS; tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/telegram-gate.ts tests/telegram-gate.test.ts
git commit -m "feat: telegram access gate with silent drop and invite deep-link redemption"
```

---

### Task 5: Tools createInvite y setMyName

**Files:**
- Create: `src/mastra/tools/create-invite-tool.ts`
- Create: `src/mastra/tools/set-my-name-tool.ts`

**Interfaces:**
- Consumes: `getUserByResourceId`, `setUserName`, `telegramIdFromResourceId` (Task 2); `createInvite` (Task 3); `appConfig.TELEGRAM_BOT_USERNAME`.
- Produces: `createInviteTool`, `setMyNameTool` (se registran en el supervisor en Task 6). Patrón idéntico a las tools existentes: `context?.agent?.resourceId` identifica al invocante.

- [ ] **Step 1: Crear create-invite-tool.ts**

`src/mastra/tools/create-invite-tool.ts`:

```ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { createInvite } from '../lib/invites'
import { getUserByResourceId } from '../lib/users'

export const createInviteTool = createTool({
    id: 'create-invite',
    description: 'Genera un link de invitación de un solo uso (vence en 7 días) para sumar a una persona nueva al bot. Solo los admins pueden usarlo.',
    inputSchema: z.object({}),
    outputSchema: z.object({
        ok: z.boolean(),
        link: z.string().optional(),
        expiresAt: z.number().optional(),
        error: z.string().optional(),
    }),
    execute: async (_input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const user = await getUserByResourceId(resourceId)
        if (!user || user.role !== 'admin') {
            return { ok: false, error: 'only admins can create invites' }
        }
        const invite = await createInvite(user.telegramId)
        return {
            ok: true,
            link: `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${invite.code}`,
            expiresAt: invite.expiresAt,
        }
    },
})
```

- [ ] **Step 2: Crear set-my-name-tool.ts**

`src/mastra/tools/set-my-name-tool.ts`:

```ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { setUserName, telegramIdFromResourceId } from '../lib/users'

export const setMyNameTool = createTool({
    id: 'set-my-name',
    description: 'Guarda o actualiza el nombre del usuario actual (cómo quiere que lo llamen). Usar cuando un usuario nuevo dice su nombre o cuando alguien pide cambiarlo.',
    inputSchema: z.object({
        name: z.string().min(1).describe('Nombre elegido por el usuario'),
    }),
    outputSchema: z.object({
        ok: z.boolean(),
    }),
    execute: async (input, context) => {
        const resourceId = context?.agent?.resourceId
        const telegramId = resourceId ? telegramIdFromResourceId(resourceId) : null
        if (!telegramId) {
            return { ok: false }
        }
        const ok = await setUserName(telegramId, input.name)
        return { ok }
    },
})
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` y `pnpm test`
Expected: limpio (la lógica de permisos vive en datos ya testeados vía repos; las tools son wrappers finos que se prueban manualmente en Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/mastra/tools/create-invite-tool.ts src/mastra/tools/set-my-name-tool.ts
git commit -m "feat: admin invite tool and set-my-name tool"
```

---

### Task 6: Cablear gate, seed y tools en el supervisor

**Files:**
- Modify: `src/mastra/agents/mostro-supervisor.ts`
- Modify: `src/mastra/index.ts:26` (tras `startNgrokTunnel`)

**Interfaces:**
- Consumes: `createTelegramGate` (Task 4), `createInviteTool`/`setMyNameTool` (Task 5), `ensureAdminSeed` (Task 2).
- Produces: bot con acceso cerrado funcionando end-to-end.

- [ ] **Step 1: Modificar mostro-supervisor.ts**

Agregar imports:

```ts
import { createTelegramGate } from '../lib/telegram-gate';
import { createInviteTool } from '../tools/create-invite-tool';
import { setMyNameTool } from '../tools/set-my-name-tool';
```

En `MOSTRO_SUPERVISOR_INSTRUCTIONS`, agregar antes de `Behaviour Rules:`:

```
User management:
- If a user message is exactly "/start <code>", they just joined through an invite link: welcome them warmly, briefly explain what you can do, and ask their name. When they answer, save it with setMyNameTool.
- If an admin asks to invite someone, use createInviteTool and give them the resulting link to forward. If the tool returns "only admins can create invites", explain that only admins can invite people.
- If a user asks to change their name, use setMyNameTool.
```

En el constructor del Agent, agregar `tools` y `handlers`:

```ts
export const mostroSupervisor = new Agent({
    id: 'mostro-supervisor',
    name: 'Mostro Supervisor',
    instructions: MOSTRO_SUPERVISOR_INSTRUCTIONS,
    model: mostroSupervisorModel,
    agents: mostroSupervisorAgents,
    tools: { createInviteTool, setMyNameTool },
    memory: new Memory(),
    channels: {
        adapters: {
            telegram: {
                adapter: createTelegramAdapter(),
                streaming: true,
                toolDisplay: 'hidden', // supress tool calls messages
            },
        },
        handlers: {
            onDirectMessage: createTelegramGate(),
        },
    },
});
```

- [ ] **Step 2: Sembrar el admin en index.ts**

En `src/mastra/index.ts`, agregar el import y la llamada junto a `startNgrokTunnel`:

```ts
import { ensureAdminSeed } from './lib/users';
```

```ts
await startNgrokTunnel(port);
await ensureAdminSeed();
```

- [ ] **Step 3: Verificar que compila y arranca**

```bash
npx tsc --noEmit
pnpm dev
```

Expected: tsc limpio; el server arranca sin errores (si `ADMIN_TELEGRAM_ID` no está en `.env`, debe loguear el warning del seed y seguir).

- [ ] **Step 4: Verificación manual por Telegram (con `.env` completo, `ADMIN_TELEGRAM_ID` = tu ID)**

1. Desde tu cuenta (admin): mandar "hola" → responde normal. Verificar en Mongo (`db.users.findOne({role:'admin'})`) que el seed existe.
2. Pedirle "generá una invitación" → devuelve link `https://t.me/<bot>?start=<code>` y aparece en `db.invites`.
3. Desde una cuenta NO registrada: mandar "hola" → **ningún** mensaje de respuesta (verificar también que no haya run del agente en Studio).
4. Desde esa cuenta: abrir el link de invitación y tocar Start → bienvenida + pregunta de nombre; responder el nombre → verificar `db.users` con `name` actualizado y `db.invites` con `usedBy`.
5. Reusar el mismo link desde una tercera cuenta → silencio (invite ya usado).
6. Desde la cuenta member: pedir "generá una invitación" → el agente explica que solo admins.

Nota: este es el punto donde se valida el supuesto del spec de que `/start CODIGO` llega como texto por `onDirectMessage`. Si no llegara, investigar el evento real que emite `@chat-adapter/telegram` para deep links antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/agents/mostro-supervisor.ts src/mastra/index.ts
git commit -m "feat: wire telegram gate, admin seed and identity tools into supervisor"
```

---

### Task 7: requestedBy en diapers

**Files:**
- Modify: `src/mastra/workflows/diapers/schemas/request-diapers-input.schema.ts`
- Modify: `src/mastra/workflows/diapers/schemas/diapers-state.schema.ts`
- Modify: `src/mastra/workflows/diapers/steps/request-diapers.step.ts`
- Modify: `src/mastra/lib/diapers-run.ts:22-43` (`startDiapers`)
- Modify: `src/mastra/tools/diapers-request-tool.ts`

**Interfaces:**
- Consumes: `getUserByResourceId` (Task 2).
- Produces: `startDiapers(mastra, { diaperType, quantity, yearMonth?, requestedBy? })`; estado del workflow con `requestedBy?: string` (visible en el status que ya leen agente y notificaciones).

- [ ] **Step 1: Ampliar schemas**

`request-diapers-input.schema.ts`:

```ts
import { z } from 'zod'

export const requestDiapersInputSchema = z.object({
    diaperType: z.string(),
    quantity: z.number(),
    requestedBy: z.string().optional(),
})
```

`diapers-state.schema.ts` — agregar dentro del `z.object`, después de `quantity`:

```ts
    requestedBy: z.string().optional(),
```

- [ ] **Step 2: Persistir en el step**

En `request-diapers.step.ts`, en el `setState`, después de `quantity: inputData.quantity,`:

```ts
            requestedBy: inputData.requestedBy,
```

- [ ] **Step 3: Threading por startDiapers**

En `diapers-run.ts`, actualizar la firma y el `start`:

```ts
export async function startDiapers(
    mastra: Mastra,
    input: { diaperType: string; quantity: number; yearMonth?: string; requestedBy?: string },
) {
```

```ts
    const result = await run.start({
        inputData: { diaperType: input.diaperType, quantity: input.quantity, requestedBy: input.requestedBy },
    })
```

- [ ] **Step 4: Resolver el nombre en la tool**

`diapers-request-tool.ts` — reemplazar el `execute` (y agregar el import):

```ts
import { getUserByResourceId } from '../lib/users'
```

```ts
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        return startDiapers(context.mastra as any, { ...input, requestedBy: user?.name || undefined })
    },
```

(`user?.name || undefined`: un member recién canjeado puede tener `name: ''`; mejor omitir que guardar vacío.)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` y `pnpm test`
Expected: limpio. Manual (opcional acá, obligatorio en Task 10): pedir pañales por Telegram y verificar `requestedBy` en el estado del run.

- [ ] **Step 6: Commit**

```bash
git add src/mastra/workflows/diapers src/mastra/lib/diapers-run.ts src/mastra/tools/diapers-request-tool.ts
git commit -m "feat: record requester name in diapers workflow state"
```

---

### Task 8: requestedBy en refunds

**Files:**
- Modify: `src/mastra/workflows/refunds/schemas/request-refund-input.schema.ts`
- Modify: `src/mastra/workflows/refunds/schemas/refunds-state.schema.ts`
- Modify: `src/mastra/workflows/refunds/steps/request-refund.step.ts`
- Modify: `src/mastra/lib/refunds-run.ts:22-45` (`startRefundRequest`)
- Modify: `src/mastra/tools/refunds-request-tool.ts`

**Interfaces:**
- Consumes: `getUserByResourceId` (Task 2).
- Produces: `startRefundRequest(mastra, { amount, reason?, yearMonth?, requestedBy? })`; estado de refunds con `requestedBy?: string`.

- [ ] **Step 1: Ampliar schemas**

`request-refund-input.schema.ts`:

```ts
import { z } from 'zod'

export const requestRefundInputSchema = z.object({
    amount: z.number(),
    reason: z.string().optional(),
    requestedBy: z.string().optional(),
})
```

`refunds-state.schema.ts` — agregar `requestedBy: z.string().optional(),` dentro del `z.object`, en la línea siguiente a `reason: z.string().optional(),`.

- [ ] **Step 2: Persistir en el step**

En `request-refund.step.ts`, en el `setState`, después de `reason: inputData.reason,`:

```ts
            requestedBy: inputData.requestedBy,
```

- [ ] **Step 3: Threading por startRefundRequest**

En `refunds-run.ts`:

```ts
export async function startRefundRequest(
    mastra: Mastra,
    input: { amount: number; reason?: string; yearMonth?: string; requestedBy?: string },
) {
```

```ts
    const result = await run.start({
        inputData: { amount: input.amount, reason: input.reason, requestedBy: input.requestedBy },
    })
```

- [ ] **Step 4: Resolver el nombre en la tool**

`refunds-request-tool.ts` — igual que en diapers: import de `getUserByResourceId` y

```ts
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        return startRefundRequest(context.mastra as any, { ...input, requestedBy: user?.name || undefined })
    },
```

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit` y `pnpm test` → limpio.

```bash
git add src/mastra/workflows/refunds src/mastra/lib/refunds-run.ts src/mastra/tools/refunds-request-tool.ts
git commit -m "feat: record requester name in refunds workflow state"
```

---

### Task 9: requestedBy en meds

Meds difiere: el workflow arranca con input vacío y las recetas entran por **resume** de `wait-prescriptions`, así que `requestedBy` viaja por el resume schema.

**Files:**
- Modify: `src/mastra/workflows/meds/schemas/wait-prescriptions-resume.schema.ts`
- Modify: `src/mastra/workflows/meds/schemas/meds-state.schema.ts`
- Modify: `src/mastra/workflows/meds/steps/wait-prescriptions.step.ts`
- Modify: `src/mastra/lib/meds-run.ts:22-44` (`startMedsOrder`)
- Modify: `src/mastra/tools/meds-request-tool.ts`

**Interfaces:**
- Consumes: `getUserByResourceId` (Task 2).
- Produces: `startMedsOrder(mastra, { medications, yearMonth?, requestedBy? })`; estado de meds con `requestedBy?: string`.

- [ ] **Step 1: Ampliar schemas**

`wait-prescriptions-resume.schema.ts`:

```ts
import { z } from 'zod'

export const waitPrescriptionsResumeSchema = z.object({
    medications: z.array(z.string()),
    requestedBy: z.string().optional(),
})
```

`meds-state.schema.ts` — agregar `requestedBy: z.string().optional(),` dentro del `z.object`, después de `medications`.

- [ ] **Step 2: Persistir en el step**

En `wait-prescriptions.step.ts`, en el `setState`, después de `medications: resumeData.medications,`:

```ts
            requestedBy: resumeData.requestedBy,
```

- [ ] **Step 3: Threading por startMedsOrder**

En `meds-run.ts`:

```ts
export async function startMedsOrder(
    mastra: Mastra,
    input: { medications: string[]; yearMonth?: string; requestedBy?: string },
) {
```

```ts
    const result = await run.resume({
        resumeData: { medications: input.medications, requestedBy: input.requestedBy },
    })
```

- [ ] **Step 4: Resolver el nombre en la tool**

`meds-request-tool.ts` — igual que en diapers: import de `getUserByResourceId` y

```ts
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        const resourceId = context?.agent?.resourceId
        const user = resourceId ? await getUserByResourceId(resourceId) : null
        return startMedsOrder(context.mastra as any, { ...input, requestedBy: user?.name || undefined })
    },
```

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit` y `pnpm test` → limpio.

```bash
git add src/mastra/workflows/meds src/mastra/lib/meds-run.ts src/mastra/tools/meds-request-tool.ts
git commit -m "feat: record requester name in meds workflow state"
```

---

### Task 10: Verificación E2E final

**Files:** ninguno nuevo (solo fixes que surjan).

- [ ] **Step 1: Suite completa**

```bash
pnpm test
npx tsc --noEmit
```

Expected: todo PASS, tsc limpio.

- [ ] **Step 2: Checklist E2E por Telegram** (requiere `.env` completo y dos cuentas de Telegram)

Repetir el checklist de Task 6 Step 4 completo, y además:

1. Como member registrado: pedir pañales → el estado del run (Studio o `getDiapersStatusTool` vía chat) muestra `requestedBy` con el nombre del member.
2. Preguntar el estado desde la otra cuenta → el agente puede nombrar quién pidió ("pidió Ana").
3. Confirmar por webhook la fecha de entrega (flujo existente) → la notificación llega a los suscriptos como antes (las suscripciones `{resourceId, threadId}` no se tocaron).

- [ ] **Step 3: Commit de cierre (si hubo fixes)**

```bash
git add -A
git commit -m "fix: e2e adjustments for user identity flow"
```

Si no hubo fixes, no commitear nada.
