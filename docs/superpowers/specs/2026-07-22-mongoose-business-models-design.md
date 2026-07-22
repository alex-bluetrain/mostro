# Mongoose Business Models Refactor — Design Spec

**Date:** 2026-07-22  
**Author:** Brainstorming session  
**Status:** Approved

---

## Overview

Migrate business models (User, Subscribers, Invites) from raw MongoDB driver to Mongoose with a Repository pattern. Goal: reduce boilerplate, follow industry standards, maintain clean separation from Mastra internals.

**Scope:** Business models only. Mastra framework storage (via `@mastra/mongodb`) remains unchanged.

**No data migration required** — MongoDB is empty.

---

## Architecture

### Directory Structure

```
src/business/
├── models/
│   ├── user.model.ts          # Schema + IUser interface
│   ├── subscriber.model.ts    # Diapers, Meds, Refunds subscriber schemas
│   └── invite.model.ts        # Invite schema
├── repositories/
│   ├── user.repository.ts     # UserRepository class
│   ├── subscriber.repository.ts
│   ├── invite.repository.ts
│   └── index.ts               # Export singleton instances
└── index.ts                   # Public API exports
```

### Design Rationale

- **Separation:** `src/business/` is distinct from `src/mastra/lib/`, clarifying domain boundaries
- **Repositories:** Encapsulate queries, provide typed methods (type-safe, testable, mockable)
- **Singletons:** Repository instances exported as singletons for injection into tools/workflows
- **Schemas:** Mongoose validates data at runtime; TypeScript interfaces provide compile-time safety

---

## Models

### 1. User Model

**File:** `src/business/models/user.model.ts`

```typescript
import { Schema, model } from 'mongoose';

export interface IUser {
  email: string;
  name: string;
  role: 'admin' | 'member';
  telegramId?: string;
  addedAt: number;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'member'], required: true },
  telegramId: { type: String, unique: true, sparse: true },
  addedAt: { type: Number, required: true },
});

export const User = model<IUser>('User', userSchema);
```

**Validation:**
- `email`: required, unique (enforced by MongoDB index), always lowercase
- `role`: enum constraint
- `telegramId`: unique, sparse (allows multiple documents without this field)
- `addedAt`: Unix timestamp (number)

### 2. Subscriber Models (Diapers, Meds, Refunds)

**CORRECTED 2026-07-22:** the original design below was written without reading the actual `src/mastra/lib/{diapers,meds,refunds}-subscribers.ts` files. Real subscribers are Telegram notification targets (`resourceId` + `threadId`), not people identified by email/telegramId. All three domains already share one physical `subscribers` collection discriminated by a `type` field. Corrected design:

**File:** `src/business/models/subscriber.model.ts`

```typescript
import { Schema, model } from 'mongoose';

export interface ISubscriber {
  type: 'diapers' | 'meds' | 'refunds';
  resourceId: string;
  threadId: string;
}

const subscriberSchema = new Schema<ISubscriber>({
  type: { type: String, enum: ['diapers', 'meds', 'refunds'], required: true },
  resourceId: { type: String, required: true },
  threadId: { type: String, required: true },
});

// Idempotency guard: matches the current addSubscriber "insert if not present" check
subscriberSchema.index({ type: 1, resourceId: 1, threadId: 1 }, { unique: true });

export const Subscriber = model<ISubscriber>('Subscriber', subscriberSchema);
```

### 3. Invite Model

**CORRECTED 2026-07-22:** the original design below was written without reading `src/mastra/lib/invites.ts`. Real invites are redeemable by a unique `code` (used to build the `t.me/<bot>?start=<code>` link), expire after 7 days, and are redeemed atomically by `telegram-gate.ts` via `redeemInvite(code, telegramId)`. Corrected design:

**File:** `src/business/models/invite.model.ts`

```typescript
import { Schema, model } from 'mongoose';

export interface IInvite {
  code: string;
  email: string;
  name?: string;
  createdBy: string; // admin email
  createdAt: number;
  expiresAt: number;
  usedBy?: string; // telegramId of whoever redeemed the invite
}

const inviteSchema = new Schema<IInvite>({
  code: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true },
  name: { type: String },
  createdBy: { type: String, required: true },
  createdAt: { type: Number, required: true },
  expiresAt: { type: Number, required: true },
  usedBy: { type: String },
});

export const Invite = model<IInvite>('Invite', inviteSchema);
```

---

## Repositories

### 1. UserRepository

**File:** `src/business/repositories/user.repository.ts`

Encapsulates all User queries. Methods replace functions from current `src/mastra/lib/users.ts`:

```typescript
import { User, type IUser } from '../models/user.model';
import { nowUnix } from '../../mastra/lib/unix-time';

export class UserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findByTelegramId(telegramId: string): Promise<IUser | null> {
    return User.findOne({ telegramId });
  }

  async upsertUser(user: Omit<IUser, 'telegramId'>): Promise<IUser> {
    const email = user.email.toLowerCase();
    return User.findOneAndUpdate(
      { email },
      { $setOnInsert: { ...user, email, addedAt: nowUnix() } },
      { upsert: true, new: true }
    );
  }

  async linkTelegramId(email: string, telegramId: string): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { telegramId } }
    );
    return result.matchedCount > 0;
  }

  async setUserName(email: string, name: string): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { name } }
    );
    return result.matchedCount > 0;
  }

  async ensureAdminSeed(adminEmail: string, adminName: string, adminTelegramId?: string): Promise<void> {
    const email = adminEmail.toLowerCase();
    await User.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          name: adminName,
          role: 'admin' as const,
          addedAt: nowUnix(),
        },
        ...(adminTelegramId ? { $set: { telegramId: adminTelegramId } } : {}),
      },
      { upsert: true }
    );
  }
}

export const userRepository = new UserRepository();
```

### 2. SubscriberRepository

**CORRECTED 2026-07-22** to match the real `add<X>Subscriber`/`list<X>Subscribers` API used by subscribe tools and notify workflow steps:

**File:** `src/business/repositories/subscriber.repository.ts`

```typescript
import { Subscriber } from '../models/subscriber.model';

type Domain = 'diapers' | 'meds' | 'refunds';
export type SubscriberEntry = { resourceId: string; threadId: string };

export class SubscriberRepository {
  async add(domain: Domain, entry: SubscriberEntry): Promise<void> {
    // Upsert with $setOnInsert reproduces the old find-then-insert idempotency
    // check atomically (no race between the check and the insert).
    await Subscriber.updateOne(
      { type: domain, resourceId: entry.resourceId, threadId: entry.threadId },
      { $setOnInsert: { type: domain, ...entry } },
      { upsert: true }
    );
  }

  async list(domain: Domain): Promise<SubscriberEntry[]> {
    const docs = await Subscriber.find({ type: domain }).lean();
    return docs.map(({ resourceId, threadId }) => ({ resourceId, threadId }));
  }
}

export const subscriberRepository = new SubscriberRepository();
```

### 3. InviteRepository

**CORRECTED 2026-07-22** to match the real code-based, atomically-redeemable invite flow (`createInvite`/`redeemInvite` in `src/mastra/lib/invites.ts`), including the cross-repository call to `userRepository.upsertUser` that provisions the invitee's user record up front:

**File:** `src/business/repositories/invite.repository.ts`

```typescript
import { randomBytes } from 'node:crypto';
import { Invite, type IInvite } from '../models/invite.model';
import { nowUnix } from '../../mastra/lib/unix-time';
import { userRepository } from './user.repository';

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class InviteRepository {
  // Creates the invite and ensures the invitee's user record exists (without
  // telegram yet) so they can already log into the web before redeeming.
  async create(params: { createdBy: string; email: string; name?: string }): Promise<IInvite> {
    const email = params.email.trim().toLowerCase();
    const now = nowUnix();
    await userRepository.upsertUser({ email, name: params.name ?? '', role: 'member', addedAt: now });
    const invite = await Invite.create({
      code: randomBytes(9).toString('base64url'),
      email,
      ...(params.name ? { name: params.name } : {}),
      createdBy: params.createdBy,
      createdAt: now,
      expiresAt: now + INVITE_TTL_SECONDS,
    });
    return invite.toObject();
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

### 4. Identity Resolution Module

**ADDED 2026-07-22:** `src/mastra/lib/users.ts` currently mixes two concerns: raw user CRUD (now `UserRepository`) and Mastra-specific resourceId parsing (`parseResourceId`, `stripSubAgentSuffix`, `getUserByResourceId`) that translates a channel resourceId (`telegram:<id>` or a plain email) into a domain `User`. This resolution logic is not itself Mongoose data access, but it is domain logic layered on top of the repository, so it lives alongside the repositories rather than back in `mastra/lib`.

**File:** `src/business/identity.ts`

```typescript
import { userRepository } from './repositories';
import { subAgentKeys } from '../mastra/lib/sub-agent-keys';
import type { IUser } from './models/user.model';

export type ParsedResourceId =
  | { kind: 'telegram'; telegramId: string }
  | { kind: 'email'; email: string };

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

// A resourceId can be 'telegram:<id>' (legacy threads / channel default) or a
// plain email (canonical: new threads and the future web).
export function parseResourceId(resourceId: string): ParsedResourceId | null {
  const base = stripSubAgentSuffix(resourceId);
  const telegramMatch = /^telegram:(.+)$/.exec(base);
  if (telegramMatch) return { kind: 'telegram', telegramId: telegramMatch[1] };
  if (base.includes('@')) return { kind: 'email', email: base.trim().toLowerCase() };
  return null;
}

export async function getUserByResourceId(resourceId: string): Promise<IUser | null> {
  const parsed = parseResourceId(resourceId);
  if (!parsed) return null;
  return parsed.kind === 'telegram'
    ? userRepository.findByTelegramId(parsed.telegramId)
    : userRepository.findByEmail(parsed.email);
}

export async function setUserNameByResourceId(resourceId: string, name: string): Promise<boolean> {
  const parsed = parseResourceId(resourceId);
  if (!parsed) return false;
  if (parsed.kind === 'email') return userRepository.setUserName(parsed.email, name);
  const user = await userRepository.findByTelegramId(parsed.telegramId);
  if (!user) return false;
  return userRepository.setUserName(user.email, name);
}
```

### Repository Exports

**File:** `src/business/repositories/index.ts`

```typescript
export { userRepository } from './user.repository';
export { subscriberRepository } from './subscriber.repository';
export { inviteRepository } from './invite.repository';
```

---

## Integration

### MongoDB Connection

Initialize in `src/mastra/index.ts` before creating agents:

```typescript
import mongoose from 'mongoose';
import { appConfig } from './config/app.config';

// Connect to MongoDB (Mongoose manages connection pooling)
await mongoose.connect(appConfig.MONGODB_URI, {
  dbName: appConfig.MONGODB_DB_NAME,
});

// Seed admin if needed
await userRepository.ensureAdminSeed(
  appConfig.ADMIN_EMAIL,
  appConfig.ADMIN_NAME,
  appConfig.ADMIN_TELEGRAM_ID
);

// Then create Mastra agents/workflows...
export const mastra = new Mastra({...});
```

### Updating Existing Code

Replace imports in tools/workflows:

**Before:**
```typescript
import { getUserByEmail, linkTelegramId } from '../lib/users';
```

**After:**
```typescript
import { userRepository } from '../../business/repositories';
// Use: userRepository.findByEmail(), userRepository.linkTelegramId()
```

**Real consumer map (verified 2026-07-22 by reading every file, not guessed):**

| Old import | Old symbol | New import | New symbol |
|---|---|---|---|
| `../lib/users` | `setUserNameByResourceId` | `../../business/identity` | `setUserNameByResourceId` |
| `../lib/users` | `getUserByResourceId` | `../../business/identity` | `getUserByResourceId` |
| `./users` (from lib) | `getUserByTelegramId` | `../../business/repositories` | `userRepository.findByTelegramId` |
| `./users` (from lib) | `linkTelegramId` | `../../business/repositories` | `userRepository.linkTelegramId` |
| `./users` (from lib) | `getUserByEmail` | `../../business/repositories` | `userRepository.findByEmail` |
| `../lib/invites` | `createInvite` | `../../business/repositories` | `inviteRepository.create` |
| `./invites` (from lib) | `redeemInvite`, `type Invite` | `../../business/repositories`, `../../business` | `inviteRepository.redeem`, `type IInvite` |
| `../lib/diapers-subscribers` | `addSubscriber` | `../../business/repositories` | `subscriberRepository.add('diapers', ...)` |
| `../lib/meds-subscribers` | `addMedsSubscriber` | `../../business/repositories` | `subscriberRepository.add('meds', ...)` |
| `../lib/refunds-subscribers` | `addRefundsSubscriber` | `../../business/repositories` | `subscriberRepository.add('refunds', ...)` |
| `../../../lib/diapers-subscribers` | `listSubscribers` | `../../../business/repositories` | `subscriberRepository.list('diapers')` |
| `../../../lib/meds-subscribers` | `listMedsSubscribers` | `../../../business/repositories` | `subscriberRepository.list('meds')` |
| `../../../lib/refunds-subscribers` | `listRefundsSubscribers` | `../../../business/repositories` | `subscriberRepository.list('refunds')` |

Consumer files, by symbol used:
- `getUserByResourceId`: `create-invite-tool.ts`, `meds-request-tool.ts`, `refunds-request-tool.ts`, `diapers-request-tool.ts`
- `setUserNameByResourceId`: `set-my-name-tool.ts`
- `getUserByTelegramId` + `linkTelegramId`: `telegram-gate.ts`
- `getUserByTelegramId` (alone): `mostro-supervisor.ts`
- `getUserByEmail`: `google-auth.ts`
- `createInvite`: `create-invite-tool.ts`
- `redeemInvite` + `type Invite`: `telegram-gate.ts`
- `add<X>Subscriber`: `diapers-subscribe-tool.ts`, `meds-subscribe-tool.ts`, `refunds-subscribe-tool.ts`
- `list<X>Subscribers`: `notify-diapers-confirmation.step.ts`, `notify-meds-ack.step.ts`, `notify-meds-confirmation.step.ts`, `notify-refund-ack.step.ts`, `notify-refund-confirmation.step.ts`, `notify-deposit.step.ts`

**Note:** the `get-*-status-tool.ts` tools (diapers/meds/refunds) do NOT touch subscribers or users — they read workflow state via `*-run.ts`. Out of scope for this migration.

**Cleanup:** Delete `src/mastra/lib/users.ts`, `diapers-subscribers.ts`, `meds-subscribers.ts`, `refunds-subscribers.ts`, `invites.ts` after all imports are updated. `src/mastra/lib/mongo-client.ts` and `mongodb.ts` become unused once those five files are gone (verified: no other consumers) and should be deleted too.

---

## Testing

Repositories are easily mockable:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { userRepository } from '../business/repositories';
import { setMyNameTool } from './set-my-name-tool';

describe('setMyNameTool', () => {
  it('updates user name', async () => {
    vi.spyOn(userRepository, 'setUserName').mockResolvedValue(true);
    
    const result = await setMyNameTool.execute({
      resourceId: 'test@gmail.com',
      name: 'John',
    });
    
    expect(userRepository.setUserName).toHaveBeenCalledWith('test@gmail.com', 'John');
    expect(result).toBe(true);
  });
});
```

Benefits:
- No MongoDB required for unit tests
- Fast, predictable test execution
- Clear dependencies (repository is injectable)

---

## Dependencies

**Add to `package.json`:**
```json
{
  "dependencies": {
    "mongoose": "^8.0.0"
  }
}
```

Mongoose is standard-library, mature, well-documented. Compatible with TypeScript and Mastra.

---

## Migration Path

1. Create `src/business/models/` with all three schemas
2. Create `src/business/repositories/` with all three repository classes
3. Create `src/business/index.ts` exporting public API
4. Update `src/mastra/index.ts` to initialize Mongoose and call `userRepository.ensureAdminSeed()`
5. Incrementally replace imports in tools/workflows (one file at a time)
6. Delete old `src/mastra/lib/{users,*-subscribers,invites}.ts` files once all imports updated
7. Run tests, validate behavior matches old implementation

---

## Success Criteria

✅ All business models use Mongoose schemas with validation  
✅ Repositories provide typed, mockable methods  
✅ Tests mock repositories instead of MongoDB  
✅ No changes to Mastra framework storage or agent behavior  
✅ Boilerplate reduced (~40% fewer lines in data-access code)  
✅ All existing functionality preserved  

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Mongoose connection pooling conflicts with Mastra | Single connect in `index.ts` before Mastra creation; MongoDB stores are read-only |
| Breaking change to imports | Gradual migration, one tool at a time; old functions kept until all imports updated |
| Mongoose validation too strict | Schemas match current validation exactly (email lowercase, unique constraints) |

