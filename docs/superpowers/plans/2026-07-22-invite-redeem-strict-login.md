# Invite Redeem + Strict Google Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El login de Google solo acepta usuarios existentes; las invitaciones dejan de pre-crear el usuario (se crea al canjear por Telegram) y se mandan solas por mail vía Composio.

**Architecture:** Se envuelve `handleCallback` de `MastraAuthGoogle` para rechazar emails desconocidos antes de emitir la cookie (y completar el nombre desde Google). `InviteRepository.create` pierde el `upsertUser`; el handler de `/start` provisiona el usuario con un upsert atómico nuevo. Un módulo `invite-email` usa el SDK de Composio (toolkit Gmail) y el tool de invitación lo llama tras crear el invite.

**Tech Stack:** Mastra 1.x, `@mastra/auth-google`, Mongoose, Vitest, `@composio/core` (nuevo), pnpm.

**Spec:** `docs/superpowers/specs/2026-07-22-invite-system-strict-login-design.md`

## Global Constraints

- Gestor de paquetes: **pnpm** (`pnpm add`, `pnpm test`) — nunca npm.
- Mensajes de commit en **inglés**, sin co-autoría ni menciones a Claude ni jerga interna.
- Copy visible al usuario (mails, mensajes del bot, descripciones de tools) en **español rioplatense** con tildes correctas.
- TypeScript estricto, ES2022, ESM. Verificación de tipos: `pnpm exec tsc --noEmit`.
- APIs de Mastra/Composio: ante cualquier error de tipos, verificar contra `node_modules/@mastra/*/dist/docs/` o los `.d.ts` instalados — no confiar en memoria (skill `mastra`).
- Tests con Vitest, en `src/**/<nombre>.test.ts`, siguiendo el estilo de mocks de `src/business/repositories/user.repository.test.ts` (`vi.mock` del modelo/módulo, `vi.clearAllMocks()` en `beforeEach`).
- En tests que (directa o transitivamente) importen `src/mastra/config/app.config.ts`, mockear ese módulo con `vi.mock` — el módulo real hace `envSchema.parse(process.env)` al importarse y aborta sin env vars.

---

### Task 1: `UserRepository.upsertFromInviteRedeem`

Provisiona el usuario en el momento del canje (upsert atómico crea-o-linkea). También afloja `name` en el modelo: el usuario nuevo nace sin nombre (Google lo completa después).

**Files:**
- Modify: `src/business/models/user.model.ts`
- Modify: `src/business/repositories/user.repository.ts`
- Test: `src/business/repositories/user.repository.test.ts`

**Interfaces:**
- Consumes: `User` (modelo mongoose), `nowUnix()` de `src/mastra/lib/unix-time.ts`.
- Produces: `userRepository.upsertFromInviteRedeem(email: string, telegramId: string): Promise<IUser>` — usada por Task 3.

- [ ] **Step 1: Write the failing test**

Agregar al final del `describe` en `src/business/repositories/user.repository.test.ts`:

```typescript
  it('upsertFromInviteRedeem creates the user with telegram linked', async () => {
    const mockUser = { email: 'new@gmail.com', name: '', role: 'member' as const, telegramId: '42', addedAt: 123 };
    vi.mocked(User.findOneAndUpdate).mockResolvedValue(mockUser as any);

    const result = await userRepository.upsertFromInviteRedeem('New@Gmail.com', '42');

    expect(result).toEqual(mockUser);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'new@gmail.com' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ email: 'new@gmail.com', name: '', role: 'member' }),
        $set: { telegramId: '42' },
      }),
      { upsert: true, new: true }
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/business/repositories/user.repository.test.ts`
Expected: FAIL — `upsertFromInviteRedeem is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `src/business/models/user.model.ts`, cambiar la línea de `name`:

```typescript
  name: { type: String, default: '' },
```

(antes: `name: { type: String, required: true },` — los usuarios nuevos nacen sin nombre y `required` en mongoose rechaza el string vacío en validaciones de create).

En `src/business/repositories/user.repository.ts`, agregar dentro de la clase, después de `linkTelegramId`:

```typescript
  // Redeem-time provisioning: creates the user on their first /start, or just
  // links telegram when the email already exists (legacy users, admin seed).
  async upsertFromInviteRedeem(email: string, telegramId: string): Promise<IUser> {
    const normalized = email.toLowerCase();
    const result = await User.findOneAndUpdate(
      { email: normalized },
      {
        $setOnInsert: {
          email: normalized,
          name: '',
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/business/repositories/user.repository.test.ts`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 5: Commit**

```bash
git add src/business/models/user.model.ts src/business/repositories/user.repository.ts src/business/repositories/user.repository.test.ts
git commit -m "feat: add redeem-time user provisioning upsert"
```

---

### Task 2: `InviteRepository.create` deja de pre-crear el usuario

**Files:**
- Modify: `src/business/repositories/invite.repository.ts`
- Test: `src/business/repositories/invite.repository.test.ts`

**Interfaces:**
- Produces: `inviteRepository.create(params: { createdBy: string; email: string }): Promise<IInvite>` — ya no acepta `name` ni toca `users`. `redeem` queda igual. Usada por Task 6.
- Nota: `IInvite.name` sigue existiendo como opcional en el modelo (invites legacy en la base pueden tenerlo); solo se deja de escribir.

- [ ] **Step 1: Update the test (falla primero)**

Reemplazar el contenido completo de `src/business/repositories/invite.repository.test.ts` por:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inviteRepository } from './invite.repository';
import { Invite } from '../models/invite.model';

vi.mock('../models/invite.model');

describe('InviteRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create only creates the invite document, without provisioning a user', async () => {
    const mockInvite = {
      code: 'abc123',
      email: 'test@gmail.com',
      createdBy: 'admin@gmail.com',
      createdAt: 1000,
      expiresAt: 1000 + 7 * 24 * 60 * 60,
      toObject() {
        return this;
      },
    };
    vi.mocked(Invite.create).mockResolvedValue(mockInvite as any);

    const result = await inviteRepository.create({ createdBy: 'admin@gmail.com', email: 'Test@Gmail.com' });

    expect(Invite.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@gmail.com', createdBy: 'admin@gmail.com' })
    );
    expect(result.code).toBe('abc123');
  });

  it('redeem matches only unused, unexpired invites and marks them used', async () => {
    const mockInvite = { code: 'abc123', email: 'test@gmail.com', usedBy: '999' };
    vi.mocked(Invite.findOneAndUpdate).mockResolvedValue(mockInvite as any);

    const result = await inviteRepository.redeem('abc123', '999');

    expect(result).toEqual(mockInvite);
    expect(Invite.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'abc123', usedBy: { $exists: false } }),
      { $set: { usedBy: '999' } },
      { new: true }
    );
  });
});
```

(Se elimina el mock de `./user.repository` y toda aserción sobre `upsertUser`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/business/repositories/invite.repository.test.ts`
Expected: FAIL — el `create` actual llama a `userRepository.upsertUser` real (sin mock, revienta o no matchea la aserción de `Invite.create` porque incluye lógica de `name`). Cualquiera de los dos síntomas confirma que el test nuevo muerde.

- [ ] **Step 3: Write minimal implementation**

Reemplazar el contenido completo de `src/business/repositories/invite.repository.ts` por:

```typescript
import { randomBytes } from 'node:crypto';
import { Invite, type IInvite } from '../models/invite.model';
import { nowUnix } from '../../mastra/lib/unix-time';

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export function generateInviteCode(): string {
  return randomBytes(9).toString('base64url');
}

export class InviteRepository {
  // Creates only the invite document: the user is provisioned at redeem time
  // (telegram /start), never at invite time.
  async create(params: { createdBy: string; email: string }): Promise<IInvite> {
    const email = params.email.trim().toLowerCase();
    const now = nowUnix();
    const invite = await Invite.create({
      code: generateInviteCode(),
      email,
      createdBy: params.createdBy,
      createdAt: now,
      expiresAt: now + INVITE_TTL_SECONDS,
    });
    return invite.toObject() as IInvite;
  }

  // Atomic redeem: matches only unused, unexpired invites and marks them used
  // in the same operation (of two concurrent redemptions, one wins, the other gets null).
  async redeem(code: string, telegramId: string): Promise<IInvite | null> {
    return Invite.findOneAndUpdate(
      { code, usedBy: { $exists: false }, expiresAt: { $gt: nowUnix() } },
      { $set: { usedBy: telegramId } },
      { new: true }
    );
  }
}

export const inviteRepository = new InviteRepository();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/business/repositories/invite.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/business/repositories/invite.repository.ts src/business/repositories/invite.repository.test.ts
git commit -m "feat: stop provisioning users at invite creation"
```

---

### Task 3: `/start` de Telegram provisiona el usuario al canjear

**Files:**
- Modify: `src/mastra/lib/telegram-start.ts`
- Create: `src/mastra/lib/telegram-start.test.ts`

**Interfaces:**
- Consumes: `userRepository.upsertFromInviteRedeem(email, telegramId): Promise<IUser>` (Task 1), `inviteRepository.redeem` (sin cambios).
- Produces: `TelegramStartDeps` pasa a ser `{ getUserByTelegramId, redeemInvite, provisionUser }` — desaparece `linkTelegramId` de este flujo. `buildWelcomeMessage`, `KNOWN_USER_GREETING`, `INVALID_INVITE_MESSAGE` no cambian de firma.

- [ ] **Step 1: Write the failing tests**

Crear `src/mastra/lib/telegram-start.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  createTelegramStartHandler,
  buildWelcomeMessage,
  KNOWN_USER_GREETING,
  INVALID_INVITE_MESSAGE,
  type TelegramStartDeps,
} from './telegram-start';
import type { IInvite, IUser } from '../../business';

const invite: IInvite = {
  code: 'abc123',
  email: 'new@gmail.com',
  createdBy: 'admin@gmail.com',
  createdAt: 1000,
  expiresAt: 2000,
};

const newUser: IUser = { email: 'new@gmail.com', name: '', role: 'member', telegramId: '42', addedAt: 1500 };

function makeDeps(overrides: Partial<TelegramStartDeps> = {}): TelegramStartDeps {
  return {
    getUserByTelegramId: vi.fn().mockResolvedValue(null),
    redeemInvite: vi.fn().mockResolvedValue(invite),
    provisionUser: vi.fn().mockResolvedValue(newUser),
    ...overrides,
  };
}

function makeEvent(text: string) {
  return { user: { userId: '42' }, text, channel: { post: vi.fn().mockResolvedValue(undefined) } };
}

describe('createTelegramStartHandler', () => {
  it('greets known users without redeeming anything', async () => {
    const deps = makeDeps({ getUserByTelegramId: vi.fn().mockResolvedValue(newUser) });
    const event = makeEvent('abc123');

    await createTelegramStartHandler(deps)(event);

    expect(event.channel.post).toHaveBeenCalledWith(KNOWN_USER_GREETING);
    expect(deps.redeemInvite).not.toHaveBeenCalled();
  });

  it('rejects when there is no code or the code is invalid', async () => {
    const deps = makeDeps({ redeemInvite: vi.fn().mockResolvedValue(null) });

    const noCode = makeEvent('   ');
    await createTelegramStartHandler(deps)(noCode);
    expect(noCode.channel.post).toHaveBeenCalledWith(INVALID_INVITE_MESSAGE);

    const badCode = makeEvent('nope');
    await createTelegramStartHandler(deps)(badCode);
    expect(badCode.channel.post).toHaveBeenCalledWith(INVALID_INVITE_MESSAGE);
  });

  it('provisions the user on a valid redeem and welcomes asking for the name', async () => {
    const deps = makeDeps();
    const event = makeEvent('abc123');

    await createTelegramStartHandler(deps)(event);

    expect(deps.provisionUser).toHaveBeenCalledWith('new@gmail.com', '42');
    expect(event.channel.post).toHaveBeenCalledWith(buildWelcomeMessage(undefined));
  });

  it('uses the legacy invite name in the welcome when present', async () => {
    const deps = makeDeps({ redeemInvite: vi.fn().mockResolvedValue({ ...invite, name: 'Ana' }) });
    const event = makeEvent('abc123');

    await createTelegramStartHandler(deps)(event);

    expect(event.channel.post).toHaveBeenCalledWith(buildWelcomeMessage('Ana'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/mastra/lib/telegram-start.test.ts`
Expected: FAIL — error de tipos/runtime porque `TelegramStartDeps` todavía exige `linkTelegramId` y no existe `provisionUser`.

- [ ] **Step 3: Write minimal implementation**

En `src/mastra/lib/telegram-start.ts`:

Reemplazar el tipo y los deps por defecto:

```typescript
export type TelegramStartDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    redeemInvite: (code: string, telegramId: string) => Promise<IInvite | null>
    provisionUser: (email: string, telegramId: string) => Promise<IUser>
}

const defaultDeps: TelegramStartDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    redeemInvite: (code, telegramId) => inviteRepository.redeem(code, telegramId),
    provisionUser: (email, telegramId) => userRepository.upsertFromInviteRedeem(email, telegramId),
}
```

Reemplazar el bloque post-redeem del handler (desde `const linked = ...` hasta el `post(buildWelcomeMessage(...))` inclusive) por:

```typescript
            const user = await deps.provisionUser(invite.email, telegramId)
            await event.channel.post(buildWelcomeMessage(user.name || invite.name))
```

(`user.name` es `''` para usuarios nuevos → cae en `invite.name`, que solo existe en invites legacy → `undefined` dispara el "¿cómo te llamás?" de `buildWelcomeMessage`. Si `provisionUser` lanza, el `catch` exterior existente ya lo loguea.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/mastra/lib/telegram-start.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/lib/telegram-start.ts src/mastra/lib/telegram-start.test.ts
git commit -m "feat: provision user at telegram invite redeem"
```

---

### Task 4: Login de Google estricto (gate en el callback SSO)

`@mastra/auth-google` emite la cookie de sesión en `handleCallback` sin consultar `authorizeUser`; el gate se aplica envolviendo esa propiedad de instancia (es asignada dinámicamente por `attachSSOProvider()` en el constructor — no alcanza con un método de subclase, quedaría sombreado).

**Files:**
- Create: `src/mastra/lib/google-auth-gate.ts`
- Create: `src/mastra/lib/google-auth-gate.test.ts`
- Modify: `src/mastra/lib/google-auth.ts`

**Interfaces:**
- Consumes: `userRepository.findByEmail`, `userRepository.setUserName` (existentes).
- Produces: `assertInvitedAndSyncName(user: { email?: string; emailVerified?: boolean; name?: string }, deps?: GoogleAuthGateDeps): Promise<void>` — lanza si el usuario no está en `users`; completa el nombre desde Google solo si está vacío.

- [ ] **Step 1: Write the failing tests**

Crear `src/mastra/lib/google-auth-gate.test.ts` (el gate vive en un archivo propio sin `app.config` para que el test no necesite mockear env):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { assertInvitedAndSyncName, type GoogleAuthGateDeps } from './google-auth-gate';

function makeDeps(overrides: Partial<GoogleAuthGateDeps> = {}): GoogleAuthGateDeps {
  return {
    findByEmail: vi.fn().mockResolvedValue({ name: 'Ana' }),
    setUserName: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('assertInvitedAndSyncName', () => {
  it('rejects users without a verified email', async () => {
    const deps = makeDeps();
    await expect(assertInvitedAndSyncName({}, deps)).rejects.toThrow();
    await expect(
      assertInvitedAndSyncName({ email: 'x@gmail.com', emailVerified: false }, deps)
    ).rejects.toThrow();
    expect(deps.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects emails that are not in the users collection', async () => {
    const deps = makeDeps({ findByEmail: vi.fn().mockResolvedValue(null) });
    await expect(
      assertInvitedAndSyncName({ email: 'stranger@gmail.com', name: 'S' }, deps)
    ).rejects.toThrow(/invite/);
    expect(deps.setUserName).not.toHaveBeenCalled();
  });

  it('fills an empty name from the google profile', async () => {
    const deps = makeDeps({ findByEmail: vi.fn().mockResolvedValue({ name: '' }) });
    await assertInvitedAndSyncName({ email: 'new@gmail.com', name: 'Nueva Persona' }, deps);
    expect(deps.setUserName).toHaveBeenCalledWith('new@gmail.com', 'Nueva Persona');
  });

  it('never overwrites an existing name', async () => {
    const deps = makeDeps();
    await assertInvitedAndSyncName({ email: 'ana@gmail.com', name: 'Otro Nombre' }, deps);
    expect(deps.setUserName).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/mastra/lib/google-auth-gate.test.ts`
Expected: FAIL — módulo `./google-auth-gate` inexistente.

- [ ] **Step 3: Write the gate implementation**

Crear `src/mastra/lib/google-auth-gate.ts`:

```typescript
import { userRepository } from '../../business/repositories'

export type GoogleAuthGateDeps = {
    findByEmail: (email: string) => Promise<{ name: string } | null>
    setUserName: (email: string, name: string) => Promise<boolean>
}

const defaultDeps: GoogleAuthGateDeps = {
    findByEmail: email => userRepository.findByEmail(email),
    setUserName: (email, name) => userRepository.setUserName(email, name),
}

// El SSO de @mastra/auth-google emite la cookie de sesión sin consultar
// authorizeUser, así que el allowlist se aplica acá, antes de que exista la
// sesión. De paso completa el nombre desde el perfil de Google la primera vez;
// nunca pisa un nombre ya elegido (p. ej. vía set-my-name-tool).
export async function assertInvitedAndSyncName(
    user: { email?: string; emailVerified?: boolean; name?: string },
    deps: GoogleAuthGateDeps = defaultDeps,
): Promise<void> {
    if (!user.email || user.emailVerified === false) {
        throw new Error('google account has no verified email')
    }
    const known = await deps.findByEmail(user.email)
    if (!known) {
        throw new Error(`no user for ${user.email}: access is invite-only`)
    }
    if (!known.name && user.name) {
        await deps.setUserName(user.email, user.name)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/mastra/lib/google-auth-gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the gate into `createGoogleAuth`**

Reemplazar el contenido completo de `src/mastra/lib/google-auth.ts` por:

```typescript
import { MastraAuthGoogle, type GoogleUser } from '@mastra/auth-google'
import { appConfig } from '../config/app.config'
import { userRepository } from '../../business/repositories'
import { assertInvitedAndSyncName } from './google-auth-gate'

// El webhook del canal Telegram vive bajo /api/* (protegido por default del
// middleware de auth) pero ya tiene su propia protección vía
// TELEGRAM_WEBHOOK_SECRET_TOKEN, así que debe quedar público o el bot muere
const TELEGRAM_CHANNEL_WEBHOOK = /^\/api\/agents\/[^/]+\/channels\/telegram\/webhook$/

// handleCallback es una propiedad de instancia asignada por attachSSOProvider()
// en el constructor (no un método de la clase), así que se envuelve la
// propiedad: un override de subclase quedaría sombreado.
type SSOCallback = (code: string, state: string) => Promise<{ user: GoogleUser }>

export function createGoogleAuth(): MastraAuthGoogle | undefined {
    if (!appConfig.GOOGLE_CLIENT_ID || !appConfig.GOOGLE_CLIENT_SECRET) {
        console.warn('[google-auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set, server auth disabled')
        return undefined
    }

    const auth = new MastraAuthGoogle({
        clientId: appConfig.GOOGLE_CLIENT_ID,
        clientSecret: appConfig.GOOGLE_CLIENT_SECRET,
        redirectUri: appConfig.GOOGLE_REDIRECT_URI,
        session: appConfig.GOOGLE_COOKIE_PASSWORD
            ? { cookiePassword: appConfig.GOOGLE_COOKIE_PASSWORD }
            : undefined,
        public: [TELEGRAM_CHANNEL_WEBHOOK],
        // Autorizado = existir en la colección users (la identidad canónica es
        // el email). Segunda línea de defensa para /api/*: la primera es el
        // gate del callback SSO de abajo, que ni siquiera emite la cookie.
        authorizeUser: async user => {
            if (!user?.email || user.emailVerified === false) return false
            return (await userRepository.findByEmail(user.email)) !== null
        },
    })

    const sso = auth as unknown as { handleCallback?: SSOCallback }
    const originalHandleCallback = sso.handleCallback?.bind(auth)
    if (originalHandleCallback) {
        sso.handleCallback = async (code, state) => {
            const result = await originalHandleCallback(code, state)
            await assertInvitedAndSyncName(result.user)
            return result
        }
    } else {
        console.warn('[google-auth] SSO handleCallback not present; invite gate not applied to login')
    }

    return auth
}
```

- [ ] **Step 6: Typecheck y suite completa**

Run: `pnpm exec tsc --noEmit`
Expected: sin errores. (Si `GoogleUser` no se exportara así en la versión instalada, verificar el nombre exacto en `node_modules/@mastra/auth-google/dist/index.d.ts` — línea `export type { ... GoogleUser ... }`.)

Run: `pnpm test`
Expected: PASS completo.

- [ ] **Step 7: Commit**

```bash
git add src/mastra/lib/google-auth-gate.ts src/mastra/lib/google-auth-gate.test.ts src/mastra/lib/google-auth.ts
git commit -m "fix: reject unknown google accounts at sso login and sync name from profile"
```

---

### Task 5: Envío de mail vía Composio

**Files:**
- Modify: `package.json` (vía `pnpm add @composio/core`)
- Modify: `src/mastra/config/app.config.ts`
- Modify: `.env.example`
- Create: `src/mastra/lib/invite-email.ts`
- Create: `src/mastra/lib/invite-email.test.ts`

**Interfaces:**
- Produces: `sendInviteEmail(params: { to: string; link: string }): Promise<{ ok: boolean; error?: string }>` y `buildInviteEmail(params): { subject: string; body: string }` — usadas por Task 6.
- Config nueva: `appConfig.COMPOSIO_API_KEY?: string`, `appConfig.COMPOSIO_USER_ID: string` (default `'default'`).

- [ ] **Step 1: Instalar la dependencia**

Run: `pnpm add @composio/core`
Expected: agrega `@composio/core` a dependencies sin errores.

- [ ] **Step 2: Agregar config**

En `src/mastra/config/app.config.ts`, agregar al objeto del `envSchema` (después de `GOOGLE_COOKIE_PASSWORD`):

```typescript
    COMPOSIO_API_KEY: z.string().min(1).optional(),
    COMPOSIO_USER_ID: z.string().min(1).default('default'),
```

En `.env.example`, agregar antes del bloque "External provider endpoints":

```bash
# Composio (Gmail toolkit) for sending invite emails
# COMPOSIO_USER_ID defaults to "default"; set it only if your connected Gmail
# account lives under another Composio user id
# COMPOSIO_API_KEY=
# COMPOSIO_USER_ID=
```

- [ ] **Step 3: Write the failing tests**

Crear `src/mastra/lib/invite-email.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock('@composio/core', () => ({
  Composio: vi.fn(() => ({ tools: { execute: executeMock } })),
}));

vi.mock('../config/app.config', () => ({
  appConfig: { COMPOSIO_API_KEY: 'test-key', COMPOSIO_USER_ID: 'default' },
}));

import { buildInviteEmail, sendInviteEmail } from './invite-email';

describe('buildInviteEmail', () => {
  it('includes the telegram link and the expiry warning', () => {
    const { subject, body } = buildInviteEmail({ to: 'x@gmail.com', link: 'https://t.me/bot?start=abc' });
    expect(subject.length).toBeGreaterThan(0);
    expect(body).toContain('https://t.me/bot?start=abc');
    expect(body).toContain('7 días');
  });
});

describe('sendInviteEmail', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('executes GMAIL_SEND_EMAIL with the recipient and returns ok', async () => {
    executeMock.mockResolvedValue({ successful: true });

    const result = await sendInviteEmail({ to: 'x@gmail.com', link: 'https://t.me/bot?start=abc' });

    expect(result.ok).toBe(true);
    expect(executeMock).toHaveBeenCalledWith(
      'GMAIL_SEND_EMAIL',
      expect.objectContaining({
        userId: 'default',
        arguments: expect.objectContaining({ recipient_email: 'x@gmail.com' }),
      })
    );
  });

  it('reports failure when composio says unsuccessful or throws', async () => {
    executeMock.mockResolvedValue({ successful: false, error: 'quota' });
    expect((await sendInviteEmail({ to: 'x@gmail.com', link: 'l' })).ok).toBe(false);

    executeMock.mockRejectedValue(new Error('network down'));
    const result = await sendInviteEmail({ to: 'x@gmail.com', link: 'l' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network down');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm test src/mastra/lib/invite-email.test.ts`
Expected: FAIL — módulo `./invite-email` inexistente.

- [ ] **Step 5: Write the implementation**

Crear `src/mastra/lib/invite-email.ts`:

```typescript
import { Composio } from '@composio/core'
import { appConfig } from '../config/app.config'

export type InviteEmailParams = {
    to: string
    link: string
}

export function buildInviteEmail(params: InviteEmailParams): { subject: string; body: string } {
    return {
        subject: 'Invitación a Mostro',
        body: [
            '¡Hola!',
            '',
            'Te invitaron a Mostro, el asistente que ayuda con los pedidos de pañales, medicamentos y reintegros.',
            '',
            `Para arrancar, abrí este link y tocá "Iniciar" en Telegram: ${params.link}`,
            '',
            'La invitación vence en 7 días. Después de ese primer paso en Telegram vas a poder entrar también a la web con tu cuenta de Google.',
        ].join('\n'),
    }
}

let composioClient: Composio | undefined

function getComposio(): Composio | undefined {
    if (!appConfig.COMPOSIO_API_KEY) return undefined
    composioClient ??= new Composio({ apiKey: appConfig.COMPOSIO_API_KEY })
    return composioClient
}

// Devuelve ok:false en vez de lanzar: el invite ya quedó creado y el caller
// decide cómo degradar (link manual).
export async function sendInviteEmail(params: InviteEmailParams): Promise<{ ok: boolean; error?: string }> {
    const composio = getComposio()
    if (!composio) return { ok: false, error: 'COMPOSIO_API_KEY not configured' }
    const { subject, body } = buildInviteEmail(params)
    try {
        const result = await composio.tools.execute('GMAIL_SEND_EMAIL', {
            userId: appConfig.COMPOSIO_USER_ID,
            arguments: { recipient_email: params.to, subject, body },
        })
        if (!result.successful) return { ok: false, error: result.error ?? 'GMAIL_SEND_EMAIL failed' }
        return { ok: true }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
}
```

Nota: si `tsc` marca diferencias en la firma de `tools.execute` o en el shape del resultado (`successful`/`error`), verificar contra los `.d.ts` de `node_modules/@composio/core` y ajustar — la intención (ejecutar `GMAIL_SEND_EMAIL` con `recipient_email`, `subject`, `body` scoped por `userId`) no cambia.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test src/mastra/lib/invite-email.test.ts`
Expected: PASS. Luego `pnpm exec tsc --noEmit` — sin errores.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example src/mastra/config/app.config.ts src/mastra/lib/invite-email.ts src/mastra/lib/invite-email.test.ts
git commit -m "feat: add composio gmail invite email sender"
```

---

### Task 6: `create-invite-tool` sin nombre, con envío de mail

**Files:**
- Modify: `src/mastra/tools/create-invite-tool.ts`
- Modify: `src/mastra/agents/mostro-supervisor.ts` (instrucción de invitación, línea ~31)
- Create: `src/mastra/tools/create-invite-tool.test.ts`

**Interfaces:**
- Consumes: `inviteRepository.create({ createdBy, email })` (Task 2), `sendInviteEmail({ to, link })` (Task 5), `userRepository.findByEmail`, `getUserByResourceId` (existentes).
- Produces: output del tool `{ ok, link?, expiresAt?, emailSent?, error? }`.

- [ ] **Step 1: Write the failing tests**

Crear `src/mastra/tools/create-invite-tool.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config/app.config', () => ({
  appConfig: { TELEGRAM_BOT_USERNAME: 'mostro_bot' },
}));
vi.mock('../../business/repositories', () => ({
  inviteRepository: { create: vi.fn() },
  userRepository: { findByEmail: vi.fn() },
}));
vi.mock('../../business/identity', () => ({
  getUserByResourceId: vi.fn(),
}));
vi.mock('../lib/invite-email', () => ({
  sendInviteEmail: vi.fn(),
}));

import { createInviteTool } from './create-invite-tool';
import { inviteRepository, userRepository } from '../../business/repositories';
import { getUserByResourceId } from '../../business/identity';
import { sendInviteEmail } from '../lib/invite-email';

const admin = { email: 'admin@gmail.com', name: 'Admin', role: 'admin' as const, addedAt: 1 };
const invite = { code: 'abc123', email: 'new@gmail.com', createdBy: 'admin@gmail.com', createdAt: 1, expiresAt: 999 };

function run(input: { email: string }, resourceId = 'admin@gmail.com') {
  return (createInviteTool.execute as any)(input, { agent: { resourceId } });
}

describe('createInviteTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserByResourceId).mockResolvedValue(admin);
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(inviteRepository.create).mockResolvedValue(invite as any);
    vi.mocked(sendInviteEmail).mockResolvedValue({ ok: true });
  });

  it('rejects non-admin callers', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ ...admin, role: 'member' });
    const result = await run({ email: 'new@gmail.com' });
    expect(result.ok).toBe(false);
    expect(inviteRepository.create).not.toHaveBeenCalled();
  });

  it('rejects emails that already belong to an active user', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue({ ...admin, telegramId: '42' } as any);
    const result = await run({ email: 'admin@gmail.com' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already/);
    expect(inviteRepository.create).not.toHaveBeenCalled();
  });

  it('creates the invite and emails the telegram link', async () => {
    const result = await run({ email: 'new@gmail.com' });

    expect(inviteRepository.create).toHaveBeenCalledWith({ createdBy: 'admin@gmail.com', email: 'new@gmail.com' });
    expect(sendInviteEmail).toHaveBeenCalledWith({
      to: 'new@gmail.com',
      link: 'https://t.me/mostro_bot?start=abc123',
    });
    expect(result).toMatchObject({ ok: true, emailSent: true, link: 'https://t.me/mostro_bot?start=abc123' });
  });

  it('still returns the link with a warning when the email fails', async () => {
    vi.mocked(sendInviteEmail).mockResolvedValue({ ok: false, error: 'quota' });
    const result = await run({ email: 'new@gmail.com' });

    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(result.link).toBe('https://t.me/mostro_bot?start=abc123');
    expect(result.error).toContain('quota');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/mastra/tools/create-invite-tool.test.ts`
Expected: FAIL — el tool actual no chequea usuario existente, no manda mail y pasa `name` a `create` (aserción de `create` no matchea; `sendInviteEmail` sin llamar).

- [ ] **Step 3: Write the implementation**

Reemplazar el contenido completo de `src/mastra/tools/create-invite-tool.ts` por:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { inviteRepository, userRepository } from '../../business/repositories'
import { getUserByResourceId } from '../../business/identity'
import { sendInviteEmail } from '../lib/invite-email'

export const createInviteTool = createTool({
    id: 'create-invite',
    description: 'Invita a una persona al bot y a la web: genera un código de un solo uso (vence en 7 días) y le manda la invitación por mail. Solo requiere el email de Google del invitado; el nombre se toma después de su perfil de Google. Solo los admins pueden usarlo.',
    inputSchema: z.object({
        email: z.email().describe('Email de Google del invitado (su identidad canónica)'),
    }),
    outputSchema: z.object({
        ok: z.boolean(),
        link: z.string().optional(),
        expiresAt: z.number().optional(),
        emailSent: z.boolean().optional(),
        error: z.string().optional(),
    }),
    execute: async (input, context) => {
        const resourceId = context?.agent?.resourceId
        if (!resourceId) {
            return { ok: false, error: 'caller identity not available' }
        }
        const caller = await getUserByResourceId(resourceId)
        if (!caller || caller.role !== 'admin') {
            return { ok: false, error: 'only admins can create invites' }
        }
        const existing = await userRepository.findByEmail(input.email)
        if (existing?.telegramId) {
            return { ok: false, error: 'that email already belongs to an active user' }
        }
        const invite = await inviteRepository.create({ createdBy: caller.email, email: input.email })
        const link = `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${invite.code}`
        const sent = await sendInviteEmail({ to: invite.email, link })
        return {
            ok: true,
            link,
            expiresAt: invite.expiresAt,
            emailSent: sent.ok,
            ...(sent.ok ? {} : { error: `invite created but email failed (${sent.error}): reenviá el link a mano` }),
        }
    },
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/mastra/tools/create-invite-tool.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update the supervisor instruction**

En `src/mastra/agents/mostro-supervisor.ts` (línea ~31), reemplazar la instrucción de invitación:

```
- If an admin asks to invite someone, you need the invitee's Google email (ask for it if missing; also ask for their name, which is optional). Then use createInviteTool and give back the resulting link to forward. If the tool returns "only admins can create invites", explain that only admins can invite people. Remind the admin to send the link privately to the invitee (whoever opens it becomes that person).
```

por:

```
- If an admin asks to invite someone, you only need the invitee's Google email (ask for it if missing; never ask for their name — it is taken from their Google profile later). Then use createInviteTool: it emails the invite directly to that address. If emailSent is false, hand the returned link to the admin so they can forward it privately (whoever opens it becomes that person). If the tool returns "only admins can create invites", explain that only admins can invite people.
```

- [ ] **Step 6: Commit**

```bash
git add src/mastra/tools/create-invite-tool.ts src/mastra/tools/create-invite-tool.test.ts src/mastra/agents/mostro-supervisor.ts
git commit -m "feat: send invite emails and drop name from invite tool"
```

---

### Task 7: Verificación final

**Files:** ninguno nuevo — verificación integral.

- [ ] **Step 1: Suite completa y typecheck**

Run: `pnpm test`
Expected: PASS — todos los archivos de test (repositorios, telegram-start, google-auth-gate, invite-email, create-invite-tool).

Run: `pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 2: Smoke test manual (requiere .env completo)**

Run: `pnpm dev`
Verificar en el log del boot que no haya errores nuevos y que siga apareciendo `[telegram-start] /start handler registered`. Con `GOOGLE_*` configurado, un login con una cuenta de Google NO invitada debe fallar en el callback (sin cookie de sesión, no entra a Studio). Este paso valida en vivo el gate; si algo no cierra, aplicar systematic-debugging antes de tocar código.

- [ ] **Step 3: Commit final (si el smoke test tocó algo)**

Solo si hubo ajustes: commitear con mensaje descriptivo en inglés.
```

**Notas para el ejecutor**

- Si `docs/identity.md` describe el flujo viejo (usuario creado al invitar / web antes de canjear), actualizar esa sección dentro del commit del Task 2; si no lo menciona, no tocarlo.
