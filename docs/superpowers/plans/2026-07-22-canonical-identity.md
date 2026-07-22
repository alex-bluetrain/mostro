# Canonical Identity (google email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la identidad de `telegramId` a email de Google como ID canónico: users keyed por email, invitaciones nominadas (llevan email), autorización web por colección, y memoria de agentes a nombre del email vía `resolveResourceId`.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-22-canonical-identity-design.md`. La migración del tipo `User` ondula por gate y tools, así que va atómica en la Task 1 (repos + consumidores directos). Después: auth por colección (Task 2), memoria canónica en el supervisor (Task 3), verificación y docs (Task 4). Borrón y cuenta nueva en datos: las colecciones se limpian a mano en el rollout.

**Tech Stack:** Mastra `@mastra/core@^1.48` (channels `resolveResourceId`), `@mastra/auth-google@0.1.0`, driver `mongodb@^7.5`, `zod@4`, vitest, pnpm.

## Global Constraints

- Gestor de paquetes: **pnpm** (nunca npm).
- Mensajes de commit: **en inglés**, sin co-autoría, sin mencionar Claude/Anthropic ni jerga interna.
- Fechas como **unix timestamps** (`nowUnix()` de `src/mastra/lib/unix-time.ts`).
- Estilo en `src/mastra/lib/` y `src/mastra/tools/`: 4 espacios, comillas simples, sin punto y coma. `mostro-supervisor.ts` e `index.ts` usan punto y coma — respetar el estilo del archivo que se toca.
- Emails siempre normalizados a lowercase antes de tocar la DB.
- Verificación por task: `npx tsc --noEmit` y `pnpm test`, ambos limpios antes de cada commit.
- Sin tests que requieran Mongo vivo: solo funciones puras y el gate con deps inyectadas.
- El spec manda: si algo acá lo contradice, gana el spec.

---

### Task 1: Repos v2 + consumidores directos (migración atómica del tipo User)

**Files:**
- Modify: `src/mastra/lib/users.ts` (reescritura completa)
- Modify: `src/mastra/lib/invites.ts`
- Modify: `src/mastra/lib/telegram-gate.ts`
- Modify: `src/mastra/tools/create-invite-tool.ts`
- Modify: `src/mastra/tools/set-my-name-tool.ts`
- Modify: `src/mastra/config/app.config.ts` (agregar `ADMIN_EMAIL`; `GOOGLE_ALLOWED_EMAILS` NO se toca acá, muere en Task 2)
- Modify: `.env.example` (agregar `ADMIN_EMAIL=` después de `ADMIN_NAME=`)
- Test: `tests/users.test.ts` (reescritura), `tests/telegram-gate.test.ts` (actualización)

**Interfaces:**
- Consumes: `getDb()` de `mongo-client.ts`, `nowUnix()`, `appConfig`.
- Produces (contratos que consumen Tasks 2-3 y los archivos NO tocados — los 3 request tools siguen llamando `getUserByResourceId(resourceId)` con la misma firma, e `index.ts` sigue llamando `ensureAdminSeed()`):
  - `type User = { email: string; name: string; role: 'admin' | 'member'; telegramId?: string; addedAt: number }`
  - `parseResourceId(resourceId: string): { kind: 'telegram'; telegramId: string } | { kind: 'email'; email: string } | null`
  - `getUserByEmail(email: string): Promise<User | null>`
  - `getUserByTelegramId(telegramId: string): Promise<User | null>`
  - `getUserByResourceId(resourceId: string): Promise<User | null>`
  - `upsertUser(user: Omit<User, 'telegramId'>): Promise<void>` (no pisa existentes)
  - `linkTelegramId(email: string, telegramId: string): Promise<boolean>`
  - `setUserNameByResourceId(resourceId: string, name: string): Promise<boolean>`
  - `ensureAdminSeed(): Promise<void>`
  - `createInvite(params: { createdBy: string; email: string; name?: string }): Promise<Invite>` con `Invite = { code: string; email: string; name?: string; createdBy: string; createdAt: number; expiresAt: number; usedBy?: string }`
  - `TelegramGateDeps = { getUserByTelegramId; redeemInvite; linkTelegramId }`
- Removed: `telegramIdFromResourceId`, `createUser`, `setUserName` (reemplazados por lo de arriba; no quedan otros consumidores).

- [ ] **Step 1: Reescribir los tests que fallan primero**

`tests/users.test.ts` (reemplazo completo):

```ts
import { describe, expect, it } from 'vitest'
import { parseResourceId } from '../src/mastra/lib/users'

describe('parseResourceId', () => {
    it('parsea un resourceId de telegram', () => {
        expect(parseResourceId('telegram:5551234')).toEqual({ kind: 'telegram', telegramId: '5551234' })
    })

    it('parsea un email como canónico', () => {
        expect(parseResourceId('ana@gmail.com')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
    })

    it('normaliza el email a lowercase', () => {
        expect(parseResourceId('Ana@Gmail.com')).toEqual({ kind: 'email', email: 'ana@gmail.com' })
    })

    it('devuelve null para strings sin formato conocido', () => {
        expect(parseResourceId('5551234')).toBeNull()
    })

    it('devuelve null para telegram: vacío', () => {
        expect(parseResourceId('telegram:')).toBeNull()
    })
})
```

En `tests/telegram-gate.test.ts`, actualizar fixtures y deps (el resto de los escenarios queda igual):
- `member` pasa a: `const member: User = { email: 'ana@gmail.com', telegramId: '111', name: 'Ana', role: 'member', addedAt: 1 }`
- `validInvite` pasa a: `const validInvite: Invite = { code: 'abc123XYZ_-9', email: 'nueva@gmail.com', createdBy: 'admin@gmail.com', createdAt: 1, expiresAt: 2, usedBy: '222' }`
- `makeDeps` reemplaza `createUser` por `linkTelegramId: vi.fn(async () => true)`
- El test del canje válido reemplaza la aserción de `createUser` por:

```ts
        expect(deps.linkTelegramId).toHaveBeenCalledWith('nueva@gmail.com', '222')
```

- El test "desconocido con código inválido" reemplaza `expect(deps.createUser).not.toHaveBeenCalled()` por `expect(deps.linkTelegramId).not.toHaveBeenCalled()`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `pnpm test`
Expected: FAIL — `parseResourceId` no existe; tipos de gate desactualizados.

- [ ] **Step 3: Reescribir users.ts**

`src/mastra/lib/users.ts` (contenido completo):

```ts
import type { Collection } from 'mongodb'
import { appConfig } from '../config/app.config'
import { getDb } from './mongo-client'
import { nowUnix } from './unix-time'

export type UserRole = 'admin' | 'member'

// Identidad canónica: email de Google (lowercase). telegramId es una identidad
// vinculada, se setea al canjear un invite (o por seed para el admin).
export type User = {
    email: string
    name: string
    role: UserRole
    telegramId?: string
    addedAt: number
}

export type ParsedResourceId =
    | { kind: 'telegram'; telegramId: string }
    | { kind: 'email'; email: string }

async function usersCollection(): Promise<Collection<User>> {
    const db = await getDb()
    return db.collection<User>('users')
}

// Un resourceId puede ser 'telegram:<id>' (threads legacy / default de channels)
// o un email plano (canónico: threads nuevos y futura web)
export function parseResourceId(resourceId: string): ParsedResourceId | null {
    const telegramMatch = /^telegram:(.+)$/.exec(resourceId)
    if (telegramMatch) return { kind: 'telegram', telegramId: telegramMatch[1] }
    if (resourceId.includes('@')) return { kind: 'email', email: resourceId.trim().toLowerCase() }
    return null
}

export async function getUserByEmail(email: string): Promise<User | null> {
    const col = await usersCollection()
    return col.findOne({ email: email.toLowerCase() }, { projection: { _id: 0 } })
}

export async function getUserByTelegramId(telegramId: string): Promise<User | null> {
    const col = await usersCollection()
    return col.findOne({ telegramId }, { projection: { _id: 0 } })
}

export async function getUserByResourceId(resourceId: string): Promise<User | null> {
    const parsed = parseResourceId(resourceId)
    if (!parsed) return null
    return parsed.kind === 'telegram'
        ? getUserByTelegramId(parsed.telegramId)
        : getUserByEmail(parsed.email)
}

// Upsert por email: crea si no existe, no pisa name/role de un user existente
export async function upsertUser(user: Omit<User, 'telegramId'>): Promise<void> {
    const email = user.email.toLowerCase()
    const col = await usersCollection()
    await col.updateOne(
        { email },
        { $setOnInsert: { ...user, email } },
        { upsert: true },
    )
}

// Vincula (o re-vincula, ej. cambio de teléfono) el Telegram de un user existente
export async function linkTelegramId(email: string, telegramId: string): Promise<boolean> {
    const col = await usersCollection()
    const result = await col.updateOne({ email: email.toLowerCase() }, { $set: { telegramId } })
    return result.matchedCount > 0
}

export async function setUserNameByResourceId(resourceId: string, name: string): Promise<boolean> {
    const parsed = parseResourceId(resourceId)
    if (!parsed) return false
    const filter = parsed.kind === 'telegram'
        ? { telegramId: parsed.telegramId }
        : { email: parsed.email }
    const col = await usersCollection()
    const result = await col.updateOne(filter, { $set: { name } })
    return result.matchedCount > 0
}

export async function ensureAdminSeed(): Promise<void> {
    const adminEmail = appConfig.ADMIN_EMAIL
    if (!adminEmail) {
        console.warn('[users] ADMIN_EMAIL not set, skipping admin seed')
        return
    }
    const email = adminEmail.toLowerCase()
    const col = await usersCollection()
    await col.updateOne(
        { email },
        {
            $setOnInsert: {
                email,
                name: appConfig.ADMIN_NAME ?? 'Admin',
                role: 'admin' as const,
                addedAt: nowUnix(),
            },
            // El vínculo de Telegram sí se re-aplica en cada boot (idempotente)
            ...(appConfig.ADMIN_TELEGRAM_ID ? { $set: { telegramId: appConfig.ADMIN_TELEGRAM_ID } } : {}),
        },
        { upsert: true },
    )
}
```

- [ ] **Step 4: Actualizar invites.ts**

En `src/mastra/lib/invites.ts`: agregar el import de `upsertUser` y `nowUnix` ya está; reemplazar el tipo `Invite` y `createInvite` (el resto — `INVITE_TTL_SECONDS`, `generateInviteCode`, `redeemInvite`, `invitesCollection` — queda igual):

```ts
import { upsertUser } from './users'
```

```ts
export type Invite = {
    code: string
    email: string
    name?: string
    createdBy: string
    createdAt: number
    expiresAt: number
    usedBy?: string
}
```

```ts
// Crea el invite nominado y asegura que el user destinatario exista (sin
// telegram todavía): desde este momento ya puede loguearse a la web
export async function createInvite(params: { createdBy: string; email: string; name?: string }): Promise<Invite> {
    const email = params.email.trim().toLowerCase()
    const now = nowUnix()
    await upsertUser({ email, name: params.name ?? '', role: 'member', addedAt: now })
    const invite: Invite = {
        code: generateInviteCode(),
        email,
        ...(params.name ? { name: params.name } : {}),
        createdBy: params.createdBy,
        createdAt: now,
        expiresAt: now + INVITE_TTL_SECONDS,
    }
    const col = await invitesCollection()
    await col.insertOne(invite)
    return invite
}
```

- [ ] **Step 5: Actualizar telegram-gate.ts**

Reemplazar imports, `TelegramGateDeps`, `defaultDeps` y el bloque del canje (parseStartCode y el resto del flujo quedan igual):

```ts
import type { ChannelHandler } from '@mastra/core/channels'
import { getUserByTelegramId, linkTelegramId, type User } from './users'
import { redeemInvite, type Invite } from './invites'
```

```ts
export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<User | null>
    redeemInvite: (code: string, telegramId: string) => Promise<Invite | null>
    linkTelegramId: (email: string, telegramId: string) => Promise<boolean>
}

const defaultDeps: TelegramGateDeps = { getUserByTelegramId, redeemInvite, linkTelegramId }
```

Bloque del canje dentro del handler (reemplaza el `createUser`):

```ts
        const invite = await deps.redeemInvite(code, senderId)
        if (!invite) return

        // El user existe desde que se generó el invite; el canje solo vincula
        await deps.linkTelegramId(invite.email, senderId)
        await defaultHandler(thread, message)
```

El import de `nowUnix` en este archivo queda sin uso: eliminarlo.

- [ ] **Step 6: Actualizar create-invite-tool.ts**

Reemplazar `inputSchema` y `execute` (el header del tool actualiza su description):

```ts
export const createInviteTool = createTool({
    id: 'create-invite',
    description: 'Genera un link de invitación de un solo uso (vence en 7 días) para sumar a una persona al bot y a la web. Requiere el email de Google del invitado; el nombre es opcional. Solo los admins pueden usarlo.',
    inputSchema: z.object({
        email: z.email().describe('Email de Google del invitado (su identidad canónica)'),
        name: z.string().min(1).optional().describe('Nombre del invitado, si se sabe'),
    }),
    outputSchema: z.object({
        ok: z.boolean(),
        link: z.string().optional(),
        expiresAt: z.number().optional(),
        error: z.string().optional(),
    }),
    execute: async (input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const user = await getUserByResourceId(resourceId)
        if (!user || user.role !== 'admin') {
            return { ok: false, error: 'only admins can create invites' }
        }
        const invite = await createInvite({ createdBy: user.email, email: input.email, name: input.name })
        return {
            ok: true,
            link: `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${invite.code}`,
            expiresAt: invite.expiresAt,
        }
    },
})
```

- [ ] **Step 7: Actualizar set-my-name-tool.ts**

Reemplazar el import de users y el `execute`:

```ts
import { setUserNameByResourceId } from '../lib/users'
```

```ts
    execute: async (input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false }
        }
        const ok = await setUserNameByResourceId(resourceId, input.name)
        return { ok }
    },
```

- [ ] **Step 8: Config y .env.example**

En `src/mastra/config/app.config.ts`, después de `ADMIN_NAME`:

```ts
    ADMIN_EMAIL: z.string().min(3).optional(),
```

En `.env.example`, después de `ADMIN_NAME=`:

```
ADMIN_EMAIL=
```

- [ ] **Step 9: Verificar**

Run: `pnpm test` y `npx tsc --noEmit`
Expected: todos los tests PASS (los 5 nuevos de parseResourceId, los del gate actualizados, invites y google-auth intactos); tsc limpio (los request tools e index.ts compilan sin cambios porque sus contratos no cambiaron).

- [ ] **Step 10: Commit**

```bash
git add src/mastra/lib/users.ts src/mastra/lib/invites.ts src/mastra/lib/telegram-gate.ts src/mastra/tools/create-invite-tool.ts src/mastra/tools/set-my-name-tool.ts src/mastra/config/app.config.ts .env.example tests/users.test.ts tests/telegram-gate.test.ts
git commit -m "feat: canonical user identity keyed by google email with named invites"
```

---

### Task 2: Autorización web por colección

**Files:**
- Modify: `src/mastra/lib/google-auth.ts`
- Modify: `src/mastra/config/app.config.ts` (eliminar `GOOGLE_ALLOWED_EMAILS`)
- Modify: `.env.example` (eliminar `GOOGLE_ALLOWED_EMAILS=`)
- Delete: `tests/google-auth.test.ts`

**Interfaces:**
- Consumes: `getUserByEmail` (Task 1).
- Produces: `createGoogleAuth()` sin cambios de firma; autorizado = email verificado + existe en `users`.

- [ ] **Step 1: Reescribir google-auth.ts**

Contenido completo:

```ts
import { MastraAuthGoogle } from '@mastra/auth-google'
import { appConfig } from '../config/app.config'
import { getUserByEmail } from './users'

// El webhook del canal Telegram vive bajo /api/* (protegido por default del
// middleware de auth) pero ya tiene su propia protección vía
// TELEGRAM_WEBHOOK_SECRET_TOKEN, así que debe quedar público o el bot muere
const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

export function createGoogleAuth(): MastraAuthGoogle | undefined {
    if (!appConfig.GOOGLE_CLIENT_ID || !appConfig.GOOGLE_CLIENT_SECRET) {
        console.warn('[google-auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set, server auth disabled')
        return undefined
    }

    return new MastraAuthGoogle({
        clientId: appConfig.GOOGLE_CLIENT_ID,
        clientSecret: appConfig.GOOGLE_CLIENT_SECRET,
        redirectUri: appConfig.GOOGLE_REDIRECT_URI,
        session: appConfig.GOOGLE_COOKIE_PASSWORD
            ? { cookiePassword: appConfig.GOOGLE_COOKIE_PASSWORD }
            : undefined,
        public: [TELEGRAM_CHANNEL_WEBHOOK],
        // Autorizado = existir en la colección users (la identidad canónica es
        // el email): invitar a alguien le da acceso al bot Y a la web de una
        authorizeUser: async user => {
            if (!user?.email || user.emailVerified === false) return false
            return (await getUserByEmail(user.email)) !== null
        },
    })
}
```

- [ ] **Step 2: Eliminar la env var y su test**

- En `app.config.ts`: borrar la línea `GOOGLE_ALLOWED_EMAILS: z.string().min(1).optional(),`
- En `.env.example`: borrar la línea `GOOGLE_ALLOWED_EMAILS=`
- Borrar el archivo `tests/google-auth.test.ts` (testeaba `parseAllowedEmails`, que ya no existe)

- [ ] **Step 3: Verificar y commit**

Run: `pnpm test` y `npx tsc --noEmit` → limpio.

```bash
git add src/mastra/lib/google-auth.ts src/mastra/config/app.config.ts .env.example
git rm tests/google-auth.test.ts
git commit -m "feat: authorize web login against the users collection"
```

---

### Task 3: Memoria canónica en el supervisor

**Files:**
- Modify: `src/mastra/agents/mostro-supervisor.ts`

**Interfaces:**
- Consumes: `getUserByTelegramId` (Task 1).
- Produces: threads nuevos de DM con `resourceId` = email del usuario.

- [ ] **Step 1: Agregar resolveResourceId**

Import (junto a los existentes):

```ts
import { getUserByTelegramId } from '../lib/users';
```

En la config de `channels` (hermano de `adapters` y `handlers`, estilo con punto y coma del archivo):

```ts
        // Memoria canónica: los threads nuevos de DM quedan a nombre del email
        // del usuario (no de telegram:<id>), así la futura web comparte memoria.
        // Corre solo al crear un thread; si no resuelve, cae al default (fail-safe).
        resolveResourceId: async ({ thread, message, defaultResourceId }) => {
            if (!thread.isDM) return defaultResourceId;
            const user = await getUserByTelegramId(message.author.userId);
            return user?.email ?? defaultResourceId;
        },
```

- [ ] **Step 2: Actualizar instrucciones de invitación**

En `MOSTRO_SUPERVISOR_INSTRUCTIONS`, reemplazar la línea de invitaciones del bloque "User management:" por:

```
- If an admin asks to invite someone, you need the invitee's Google email (ask for it if missing; also ask for their name, which is optional). Then use createInviteTool and give back the resulting link to forward. If the tool returns "only admins can create invites", explain that only admins can invite people.
```

- [ ] **Step 3: Verificar y commit**

Run: `npx tsc --noEmit` y `pnpm test` → limpio.

```bash
git add src/mastra/agents/mostro-supervisor.ts
git commit -m "feat: resolve agent memory owner to canonical email on new dm threads"
```

---

### Task 4: Verificación final y docs

**Files:**
- Modify: `docs/superpowers/followups.md`

- [ ] **Step 1: Suite y boot**

```bash
pnpm test
npx tsc --noEmit
```

Expected: PASS y limpio. Después un boot de humo (`pnpm dev` ~35s, capturar log, matar el árbol de procesos node de mostro al final): debe loguear el warning de `ADMIN_EMAIL`/google-auth según qué haya en `.env` y llegar a `ready`.

- [ ] **Step 2: Actualizar followups.md**

- En "Bloqueantes": reescribir el ítem del E2E para incluir el rollout canónico: limpiar colecciones `users`/`invites` viejas (keyed por telegramId) y los JSON de suscriptores; setear `ADMIN_EMAIL` (+ `ADMIN_TELEGRAM_ID`, `ADMIN_NAME`); verificar que invitar con email crea el user, el canje vincula el telegram, el thread nuevo queda a nombre del email (visible en Studio), y el login web de un no-invitado da 401.
- En el ítem de Google auth: quitar la mención a `GOOGLE_ALLOWED_EMAILS` (ya no existe; la autorización es por colección).
- En "Futuro": marcar hecho / reescribir el punto de identidad canónica (queda solo el mapeo hacia otros proveedores si algún día hiciera falta).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/followups.md
git commit -m "docs: update follow-ups for canonical identity rollout"
```
