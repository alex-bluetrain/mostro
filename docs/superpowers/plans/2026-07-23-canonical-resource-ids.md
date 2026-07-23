# Canonical Resource Ids (User Email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every resource id is the user's email (or its sub-agent derivative `<email>-<agentKey>`); the legacy `telegram:<id>` format disappears from the code.

**Architecture:** `src/business/identity.ts` becomes email-only (drop the dual-format `parseResourceId`). The supervisor's `resolveResourceId` moves to a testable factory in `src/mastra/lib/resolve-resource-id.ts` (same deps-injection pattern as `telegram-gate.ts`) that always maps the Telegram author to their email and throws if the lookup fails (strict, no fallback). No data migration: the database is wiped manually.

**Tech Stack:** TypeScript (ESM), Mastra, Mongoose, Vitest. Package manager is **pnpm** (never npm).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-canonical-resource-ids-design.md`
- Load the `mastra` skill before touching any Mastra code (AGENTS.md rule).
- Comments in the codebase are in Spanish where the surrounding file uses Spanish; match each file's existing comment language and density.
- Commits in English, no co-authorship lines, no AI mentions.
- Public signatures `getUserByResourceId(resourceId): Promise<IUser | null>` and `setUserNameByResourceId(resourceId, name): Promise<boolean>` must NOT change — tools depend on them.
- Run tests with `pnpm test` (vitest run).

---

### Task 1: `identity.ts` email-only

**Files:**
- Modify: `src/business/identity.ts`
- Test (create): `src/business/identity.test.ts`

**Interfaces:**
- Consumes: `userRepository.findByEmail(email)`, `userRepository.setUserName(email, name)` from `src/business/repositories`; `subAgentKeys` from `src/mastra/lib/sub-agent-keys`.
- Produces: `emailFromResourceId(resourceId: string): string | null` (exported; replaces `parseResourceId`/`ParsedResourceId`, which are deleted). `getUserByResourceId` and `setUserNameByResourceId` keep their existing signatures.

- [ ] **Step 1: Write the failing test**

Create `src/business/identity.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./repositories', () => ({
  userRepository: { findByEmail: vi.fn(), setUserName: vi.fn() },
}));

import { emailFromResourceId, getUserByResourceId, setUserNameByResourceId } from './identity';
import { userRepository } from './repositories';

const user = { email: 'ana@gmail.com', name: 'Ana', role: 'member' as const, addedAt: 1 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('emailFromResourceId', () => {
  it('returns a plain email trimmed and lowercased', () => {
    expect(emailFromResourceId(' Ana@Gmail.com ')).toBe('ana@gmail.com');
  });

  it('strips a registered sub-agent suffix', () => {
    expect(emailFromResourceId('ana@gmail.com-diapersAgent')).toBe('ana@gmail.com');
  });

  it('does not strip unknown suffixes', () => {
    expect(emailFromResourceId('ana@gmail.com-notAnAgent')).toBe('ana@gmail.com-notanagent');
  });

  it('returns null for non-email ids', () => {
    expect(emailFromResourceId('telegram:12345')).toBeNull();
  });
});

describe('getUserByResourceId', () => {
  it('looks up by email', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(user as any);
    const result = await getUserByResourceId('ana@gmail.com-diapersAgent');
    expect(userRepository.findByEmail).toHaveBeenCalledWith('ana@gmail.com');
    expect(result).toEqual(user);
  });

  it('returns null for non-email ids without hitting the repo', async () => {
    const result = await getUserByResourceId('telegram:12345');
    expect(result).toBeNull();
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });
});

describe('setUserNameByResourceId', () => {
  it('sets the name by email', async () => {
    vi.mocked(userRepository.setUserName).mockResolvedValue(true);
    const ok = await setUserNameByResourceId('ana@gmail.com-diapersAgent', 'Ana');
    expect(userRepository.setUserName).toHaveBeenCalledWith('ana@gmail.com', 'Ana');
    expect(ok).toBe(true);
  });

  it('returns false for non-email ids without hitting the repo', async () => {
    const ok = await setUserNameByResourceId('telegram:12345', 'Ana');
    expect(ok).toBe(false);
    expect(userRepository.setUserName).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/business/identity.test.ts`
Expected: FAIL — `emailFromResourceId` is not exported from `./identity`.

- [ ] **Step 3: Write the implementation**

Replace the contents of `src/business/identity.ts` with:

```typescript
import { userRepository } from './repositories';
import { subAgentKeys } from '../mastra/lib/sub-agent-keys';
import type { IUser } from './models/user.model';

// Sub-agent delegation derives the child resourceId as `${resourceId}-${agentName}`
// (e.g. 'ana@gmail.com-diapersAgent'); this strips that suffix so it always
// resolves to the parent identity. Only registered keys are stripped: an
// unknown suffix matches no user and the error stays visible instead of
// silently mangled.
function stripSubAgentSuffix(resourceId: string): string {
  for (const key of subAgentKeys) {
    const suffix = `-${key}`;
    if (resourceId.endsWith(suffix)) return resourceId.slice(0, -suffix.length);
  }
  return resourceId;
}

// Todo resourceId canónico es el email del usuario (resolveResourceId lo
// garantiza al crear threads). Un id sin '@' no es un email: devuelve null y
// las tools lo reportan como usuario desconocido.
export function emailFromResourceId(resourceId: string): string | null {
  const base = stripSubAgentSuffix(resourceId).trim().toLowerCase();
  return base.includes('@') ? base : null;
}

export async function getUserByResourceId(resourceId: string): Promise<IUser | null> {
  const email = emailFromResourceId(resourceId);
  if (!email) return null;
  return userRepository.findByEmail(email);
}

export async function setUserNameByResourceId(resourceId: string, name: string): Promise<boolean> {
  const email = emailFromResourceId(resourceId);
  if (!email) return false;
  return userRepository.setUserName(email, name);
}
```

Note: `ParsedResourceId` and `parseResourceId` are deleted. Verify nothing else imports them: `git grep -n "parseResourceId\|ParsedResourceId" src` must return nothing.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/business/identity.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: PASS — the only external consumers use `getUserByResourceId`/`setUserNameByResourceId`, whose signatures are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/business/identity.ts src/business/identity.test.ts
git commit -m "refactor: make identity resource ids email-only"
```

---

### Task 2: strict `resolveResourceId` factory wired into the supervisor

**Files:**
- Create: `src/mastra/lib/resolve-resource-id.ts`
- Test (create): `src/mastra/lib/resolve-resource-id.test.ts`
- Modify: `src/mastra/agents/mostro-supervisor.ts` (the `channels.resolveResourceId` block, currently lines 67-74, and the now-unused `userRepository` import)

**Interfaces:**
- Consumes: `userRepository.findByTelegramId(telegramId)` from `src/business/repositories`; `IUser` from `src/business`.
- Produces: `createResolveResourceId(deps?: ResolveResourceIdDeps)` returning `async ({ message }) => string` — the email of the message author; throws if no user matches. The supervisor consumes it as `resolveResourceId: createResolveResourceId()`.

- [ ] **Step 1: Write the failing test**

Create `src/mastra/lib/resolve-resource-id.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createResolveResourceId } from './resolve-resource-id';

const user = { email: 'ana@gmail.com', name: 'Ana', role: 'member' as const, addedAt: 1 };

function makeArgs(userId = '12345') {
  return { message: { author: { userId } } } as any;
}

describe('createResolveResourceId', () => {
  it('resolves the author to their email', async () => {
    const resolve = createResolveResourceId({
      getUserByTelegramId: vi.fn().mockResolvedValue(user),
    });
    await expect(resolve(makeArgs())).resolves.toBe('ana@gmail.com');
  });

  it('throws when no user matches the telegramId', async () => {
    const resolve = createResolveResourceId({
      getUserByTelegramId: vi.fn().mockResolvedValue(null),
    });
    await expect(resolve(makeArgs('999'))).rejects.toThrow(/999/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/mastra/lib/resolve-resource-id.test.ts`
Expected: FAIL — module `./resolve-resource-id` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/mastra/lib/resolve-resource-id.ts`:

```typescript
import { userRepository } from '../../business/repositories'
import type { IUser } from '../../business'

export type ResolveResourceIdDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
}

const defaultDeps: ResolveResourceIdDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
}

// Memoria canónica: todo thread queda a nombre del email del usuario, así la
// futura web comparte memoria. El gate rechaza desconocidos antes de llegar
// acá, así que un lookup fallido es un bug o un fallo de DB: se lanza para que
// sea ruidoso en vez de crear un thread huérfano con un id no canónico.
export function createResolveResourceId(deps: ResolveResourceIdDeps = defaultDeps) {
    return async ({ message }: { message: { author: { userId: string } } }): Promise<string> => {
        const user = await deps.getUserByTelegramId(message.author.userId)
        if (!user) {
            throw new Error(`[resolve-resource-id] no user for telegramId ${message.author.userId}`)
        }
        return user.email
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/mastra/lib/resolve-resource-id.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the supervisor**

In `src/mastra/agents/mostro-supervisor.ts`:

Replace:

```typescript
        // Memoria canónica: los threads nuevos de DM quedan a nombre del email
        // del usuario (no de telegram:<id>), así la futura web comparte memoria.
        // Corre solo al crear un thread; si no resuelve, cae al default (fail-safe).
        resolveResourceId: async ({ thread, message, defaultResourceId }) => {
            if (!thread.isDM) return defaultResourceId;
            const user = await userRepository.findByTelegramId(message.author.userId);
            return user?.email ?? defaultResourceId;
        },
```

with:

```typescript
        // Memoria canónica: todo thread queda a nombre del email del usuario
        // (nunca telegram:<id>). Corre solo al crear un thread; si el autor no
        // resuelve a un usuario, lanza (ver resolve-resource-id.ts).
        resolveResourceId: createResolveResourceId(),
```

Add the import at the top:

```typescript
import { createResolveResourceId } from '../lib/resolve-resource-id';
```

Remove the now-unused import `import { userRepository } from '../../business/repositories';` (verify with `git grep -n "userRepository" src/mastra/agents/mostro-supervisor.ts` that no other usage remains in the file first).

- [ ] **Step 6: Verify types and run the whole suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (the factory's narrower `{ message }` param is contravariance-compatible with Mastra's `{ thread, message, defaultResourceId }` callback type).

Run: `pnpm test`
Expected: PASS, all files.

- [ ] **Step 7: Commit**

```bash
git add src/mastra/lib/resolve-resource-id.ts src/mastra/lib/resolve-resource-id.test.ts src/mastra/agents/mostro-supervisor.ts
git commit -m "refactor: resolve every thread resourceId to the user email, strict"
```
