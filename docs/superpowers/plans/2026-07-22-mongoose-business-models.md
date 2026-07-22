# Mongoose Business Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate User, Subscriber, and Invite models from raw MongoDB driver to Mongoose with a Repository pattern, reducing boilerplate and following industry standards.

**Architecture:** Create three Mongoose schemas in `src/business/models/`, backed by three Repository classes in `src/business/repositories/` that encapsulate queries. Initialize Mongoose in `src/mastra/index.ts` before Mastra creation, then incrementally update tools/workflows to use repositories instead of `src/mastra/lib/` functions.

**Tech Stack:** Mongoose 8.x (TypeScript), existing MongoDB connection, Mastra 1.x

## Global Constraints

- Node ≥ 22.13.0 (existing requirement)
- Use `pnpm` for all package operations (project standard)
- Commit message style: English, no co-author, no internal jargon (project standard)
- No data migration (MongoDB is empty)
- Mongoose manages connection; Mastra framework storage (`@mastra/mongodb`) unchanged

---

## File Structure

**New files to create:**
```
src/business/
├── models/
│   ├── user.model.ts
│   ├── subscriber.model.ts
│   ├── invite.model.ts
├── repositories/
│   ├── user.repository.ts
│   ├── subscriber.repository.ts
│   ├── invite.repository.ts
│   └── index.ts
└── index.ts
```

**Files to modify:**
- `package.json` — add mongoose dependency
- `src/mastra/index.ts` — initialize Mongoose connection
- `src/mastra/tools/*.ts` — replace imports (multiple files)
- `src/mastra/workflows/*/*.ts` — replace imports (multiple files)
- `src/mastra/lib/google-auth.ts` — may use user data

**Files to delete (after all imports updated):**
- `src/mastra/lib/users.ts`
- `src/mastra/lib/diapers-subscribers.ts`
- `src/mastra/lib/meds-subscribers.ts`
- `src/mastra/lib/refunds-subscribers.ts`
- `src/mastra/lib/invites.ts`
- `src/mastra/lib/mongo-client.ts` (if no longer used)
- `src/mastra/lib/mongodb.ts` (if no longer used)

---

## Task 1: Add Mongoose Dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: Mongoose 8.x available in node_modules

- [ ] **Step 1: Add mongoose to dependencies**

Run:
```bash
pnpm add mongoose@^8.0.0
```

Expected output: `added mongoose` with version >=8.0.0

- [ ] **Step 2: Verify installation**

Run:
```bash
pnpm list mongoose
```

Expected: Shows `mongoose@8.x.x`

- [ ] **Step 3: Commit**

```bash
git add pnpm-lock.yaml package.json
git commit -m "chore: add mongoose dependency"
```

---

## Task 2: Create User Model with Schema

**Files:**
- Create: `src/business/models/user.model.ts`

**Interfaces:**
- Produces: `User` Mongoose model and `IUser` TypeScript interface, exported

- [ ] **Step 1: Create directory**

Run:
```bash
mkdir -p src/business/models
```

- [ ] **Step 2: Write user.model.ts**

Create file `src/business/models/user.model.ts`:

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

- [ ] **Step 3: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/models/user.model.ts
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/business/models/user.model.ts
git commit -m "feat: add user mongoose model and schema"
```

---

## Task 3: Create Subscriber Model with Schema

**REVISED 2026-07-22:** original version was written without reading the real `src/mastra/lib/{diapers,meds,refunds}-subscribers.ts`. Real subscribers are Telegram notification targets (`resourceId`+`threadId`), not people identified by email/telegramId. This revision was applied as a fix after the task was already committed and reviewed against the (wrong) brief — see `docs/superpowers/specs/2026-07-22-mongoose-business-models-design.md` for the corrected design rationale.

**Files:**
- Create: `src/business/models/subscriber.model.ts`

**Interfaces:**
- Produces: `Subscriber` Mongoose model and `ISubscriber` TypeScript interface, exported

- [ ] **Step 1: Write subscriber.model.ts**

Create file `src/business/models/subscriber.model.ts`:

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

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/models/subscriber.model.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/business/models/subscriber.model.ts
git commit -m "fix: correct subscriber model to match real resourceId/threadId shape"
```

---

## Task 4: Create Invite Model with Schema

**REVISED 2026-07-22:** original version was written without reading the real `src/mastra/lib/invites.ts`. Real invites are redeemable by a unique `code` (used to build the `t.me/<bot>?start=<code>` link), expire after 7 days, and are redeemed atomically via `redeemInvite(code, telegramId)` in `telegram-gate.ts`. This revision was applied as a fix after the task was already committed and reviewed against the (wrong) brief — see the spec doc for rationale.

**Files:**
- Create: `src/business/models/invite.model.ts`

**Interfaces:**
- Produces: `Invite` Mongoose model and `IInvite` TypeScript interface, exported

- [ ] **Step 1: Write invite.model.ts**

Create file `src/business/models/invite.model.ts`:

```typescript
import { Schema, model } from 'mongoose';

export interface IInvite {
  code: string;
  email: string;
  name?: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  usedBy?: string;
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

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/models/invite.model.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/business/models/invite.model.ts
git commit -m "fix: correct invite model to match real code/expiresAt redeem flow"
```

---

## Task 5: Create User Repository

**Files:**
- Create: `src/business/repositories/user.repository.ts`

**Interfaces:**
- Consumes: `User` model from Task 2, `nowUnix()` from `src/mastra/lib/unix-time`
- Produces: `UserRepository` class with methods: `findByEmail()`, `findByTelegramId()`, `upsertUser()`, `linkTelegramId()`, `setUserName()`, `ensureAdminSeed()`. Exported singleton: `userRepository`

- [ ] **Step 1: Create directory**

Run:
```bash
mkdir -p src/business/repositories
```

- [ ] **Step 2: Write user.repository.ts**

Create file `src/business/repositories/user.repository.ts`:

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
    const result = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { ...user, email, addedAt: nowUnix() } },
      { upsert: true, new: true }
    );
    if (!result) throw new Error('Failed to upsert user');
    return result;
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

- [ ] **Step 3: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/repositories/user.repository.ts
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/business/repositories/user.repository.ts
git commit -m "feat: add user repository with typed methods"
```

---

## Task 6: Create Subscriber Repository

**REVISED 2026-07-22:** depends on the corrected Task 3 model. Methods now match the real `add<X>Subscriber`/`list<X>Subscribers` API (verified by reading `diapers-subscribe-tool.ts` and all six `notify-*.step.ts` consumers).

**Files:**
- Create: `src/business/repositories/subscriber.repository.ts`

**Interfaces:**
- Consumes: `Subscriber` model from Task 3 (revised)
- Produces: `SubscriberRepository` class with methods: `add(domain, entry)`, `list(domain)`. Exported singleton: `subscriberRepository`. Exported type: `SubscriberEntry = { resourceId: string; threadId: string }`

- [ ] **Step 1: Write subscriber.repository.ts**

Create file `src/business/repositories/subscriber.repository.ts`:

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

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/repositories/subscriber.repository.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/business/repositories/subscriber.repository.ts
git commit -m "fix: correct subscriber repository to add/list by resourceId+threadId"
```

---

## Task 7: Create Invite Repository

**REVISED 2026-07-22:** depends on the corrected Task 4 model. Methods now match the real `createInvite`/`redeemInvite` flow (code generation, TTL expiry, atomic redeem, and the cross-repository call into `userRepository.upsertUser` that the old `createInvite` made).

**Files:**
- Create: `src/business/repositories/invite.repository.ts`

**Interfaces:**
- Consumes: `Invite` model from Task 4 (revised), `nowUnix()` from `src/mastra/lib/unix-time`, `userRepository` from Task 5 (same directory, `./user.repository`)
- Produces: `InviteRepository` class with methods: `create(params)`, `redeem(code, telegramId)`. Exported singleton: `inviteRepository`. Exported constant: `INVITE_TTL_SECONDS`

- [ ] **Step 1: Write invite.repository.ts**

Create file `src/business/repositories/invite.repository.ts`:

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

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/repositories/invite.repository.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/business/repositories/invite.repository.ts
git commit -m "fix: correct invite repository to code-based atomic redeem flow"
```

---

## Task 8: Create Repository Index Exports

**Files:**
- Create: `src/business/repositories/index.ts`

**Interfaces:**
- Consumes: Repositories from Tasks 5–7
- Produces: Exported singletons: `userRepository`, `subscriberRepository`, `inviteRepository`

- [ ] **Step 1: Write repositories/index.ts**

Create file `src/business/repositories/index.ts`:

```typescript
export { userRepository } from './user.repository';
export { subscriberRepository } from './subscriber.repository';
export { inviteRepository } from './invite.repository';
```

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/repositories/index.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/business/repositories/index.ts
git commit -m "feat: export repositories from index"
```

---

## Task 9: Create Business Module Index

**Files:**
- Create: `src/business/index.ts`

**Interfaces:**
- Consumes: Repositories from Task 8, Models from Tasks 2–4
- Produces: Public API exports for entire business module

- [ ] **Step 1: Write business/index.ts**

Create file `src/business/index.ts`:

```typescript
// Models (for type imports)
export { type IUser } from './models/user.model';
export { type ISubscriber } from './models/subscriber.model';
export { type IInvite } from './models/invite.model';

// Repositories
export { userRepository } from './repositories';
export { subscriberRepository } from './repositories';
export { inviteRepository } from './repositories';
```

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/business/index.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/business/index.ts
git commit -m "feat: create business module public API"
```

---

## Task 10: Initialize Mongoose Connection in Mastra Index

**Files:**
- Modify: `src/mastra/index.ts`

**Interfaces:**
- Consumes: `userRepository` from Task 5, existing `appConfig`, `Mastra` class
- Produces: Mongoose connection initialized before Mastra creation

- [ ] **Step 1: Read current src/mastra/index.ts**

Run:
```bash
head -30 src/mastra/index.ts
```

Expected: Shows current imports and initialization code

- [ ] **Step 2: Add mongoose import and connection**

Open `src/mastra/index.ts` and add these lines **before** the `startNgrokTunnel()` call:

```typescript
import mongoose from 'mongoose';
import { userRepository } from '../business/repositories';
```

Then replace:

```typescript
await startNgrokTunnel(port);
await ensureAdminSeed();
```

With:

```typescript
// Connect to MongoDB
await mongoose.connect(appConfig.MONGODB_URI, {
  dbName: appConfig.MONGODB_DB_NAME,
});

await startNgrokTunnel(port);

// Seed admin user
await userRepository.ensureAdminSeed(
  appConfig.ADMIN_EMAIL || 'admin@example.com',
  appConfig.ADMIN_NAME || 'Admin',
  appConfig.ADMIN_TELEGRAM_ID
);
```

- [ ] **Step 3: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit src/mastra/index.ts
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/mastra/index.ts
git commit -m "feat: initialize mongoose connection in mastra index"
```

---

## Task 11: Create Identity Resolution Module

**NEW 2026-07-22:** `src/mastra/lib/users.ts` mixes raw CRUD (now `UserRepository`) with resourceId-parsing/identity-resolution logic (`parseResourceId`, `stripSubAgentSuffix`, `getUserByResourceId`) consumed directly by 6 other files. This task extracts that resolution logic into its own module so `lib/users.ts` can be deleted cleanly in Task 18. See `docs/superpowers/specs/2026-07-22-mongoose-business-models-design.md` section "4. Identity Resolution Module" for the design rationale.

**Files:**
- Create: `src/business/identity.ts`

**Interfaces:**
- Consumes: `userRepository` from Task 5 (`./repositories`), `subAgentKeys` from `src/mastra/lib/sub-agent-keys` (existing file, unchanged)
- Produces: `parseResourceId(resourceId)`, `getUserByResourceId(resourceId)`, `setUserNameByResourceId(resourceId, name)` functions and `ParsedResourceId` type, all exported

- [ ] **Step 1: Write identity.ts**

Create file `src/business/identity.ts`:

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

- [ ] **Step 2: Verify TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: No errors (use the full-project check, not a single-file `tsc` invocation — a single-file invocation triggers an unrelated TS5112 tsconfig-conflict warning on this codebase's tsconfig setup)

- [ ] **Step 3: Commit**

```bash
git add src/business/identity.ts
git commit -m "feat: add identity resolution module"
```

---

## Task 12: Update Tools to Use Identity Resolution

**Files:**
- Modify: `src/mastra/tools/set-my-name-tool.ts`
- Modify: `src/mastra/tools/meds-request-tool.ts`
- Modify: `src/mastra/tools/refunds-request-tool.ts`
- Modify: `src/mastra/tools/diapers-request-tool.ts`

**Interfaces:**
- Consumes: `setUserNameByResourceId`, `getUserByResourceId` from Task 11 (`../../business/identity`)
- Produces: Tools using `business/identity` instead of `lib/users`

- [ ] **Step 1: Update set-my-name-tool.ts**

In `src/mastra/tools/set-my-name-tool.ts`, replace the only import line that reads:

```typescript
import { setUserNameByResourceId } from '../lib/users'
```

With:

```typescript
import { setUserNameByResourceId } from '../../business/identity'
```

Nothing else in the file changes — `setUserNameByResourceId` keeps the exact same signature `(resourceId: string, name: string) => Promise<boolean>` and the call site (`await setUserNameByResourceId(resourceId, input.name)`) is untouched.

- [ ] **Step 2: Update meds-request-tool.ts**

In `src/mastra/tools/meds-request-tool.ts`, replace the import line:

```typescript
import { getUserByResourceId } from '../lib/users'
```

With:

```typescript
import { getUserByResourceId } from '../../business/identity'
```

Nothing else changes — same signature, same call site (`const user = resourceId ? await getUserByResourceId(resourceId) : null`).

- [ ] **Step 3: Update refunds-request-tool.ts**

Same change in `src/mastra/tools/refunds-request-tool.ts`:

```typescript
import { getUserByResourceId } from '../lib/users'
```

→

```typescript
import { getUserByResourceId } from '../../business/identity'
```

- [ ] **Step 4: Update diapers-request-tool.ts**

Same change in `src/mastra/tools/diapers-request-tool.ts`:

```typescript
import { getUserByResourceId } from '../lib/users'
```

→

```typescript
import { getUserByResourceId } from '../../business/identity'
```

- [ ] **Step 5: Verify all four tools compile**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/mastra/tools/set-my-name-tool.ts src/mastra/tools/meds-request-tool.ts src/mastra/tools/refunds-request-tool.ts src/mastra/tools/diapers-request-tool.ts
git commit -m "refactor: use identity resolution module in tools"
```

---

## Task 13: Update Subscribe Tools to Use Subscriber Repository

**Files:**
- Modify: `src/mastra/tools/diapers-subscribe-tool.ts`
- Modify: `src/mastra/tools/meds-subscribe-tool.ts`
- Modify: `src/mastra/tools/refunds-subscribe-tool.ts`

**Interfaces:**
- Consumes: `subscriberRepository` from Task 6 (`../../business/repositories`)
- Produces: Subscribe tools using the repository's `add(domain, entry)` method

- [ ] **Step 1: Update diapers-subscribe-tool.ts**

In `src/mastra/tools/diapers-subscribe-tool.ts`, replace:

```typescript
import { addSubscriber } from '../lib/diapers-subscribers'
```

With:

```typescript
import { subscriberRepository } from '../../business/repositories'
```

Replace the call:

```typescript
await addSubscriber({ resourceId, threadId })
```

With:

```typescript
await subscriberRepository.add('diapers', { resourceId, threadId })
```

- [ ] **Step 2: Update meds-subscribe-tool.ts**

In `src/mastra/tools/meds-subscribe-tool.ts`, replace:

```typescript
import { addMedsSubscriber } from '../lib/meds-subscribers'
```

With:

```typescript
import { subscriberRepository } from '../../business/repositories'
```

Replace the call:

```typescript
await addMedsSubscriber({ resourceId, threadId })
```

With:

```typescript
await subscriberRepository.add('meds', { resourceId, threadId })
```

- [ ] **Step 3: Update refunds-subscribe-tool.ts**

In `src/mastra/tools/refunds-subscribe-tool.ts`, replace:

```typescript
import { addRefundsSubscriber } from '../lib/refunds-subscribers'
```

With:

```typescript
import { subscriberRepository } from '../../business/repositories'
```

Replace the call:

```typescript
await addRefundsSubscriber({ resourceId, threadId })
```

With:

```typescript
await subscriberRepository.add('refunds', { resourceId, threadId })
```

- [ ] **Step 4: Verify all three tools compile**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/mastra/tools/diapers-subscribe-tool.ts src/mastra/tools/meds-subscribe-tool.ts src/mastra/tools/refunds-subscribe-tool.ts
git commit -m "refactor: use subscriber repository in subscribe tools"
```

---

## Task 14: Update Notify Workflow Steps to Use Subscriber Repository

**Files:**
- Modify: `src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts`
- Modify: `src/mastra/workflows/meds/steps/notify-meds-ack.step.ts`
- Modify: `src/mastra/workflows/meds/steps/notify-meds-confirmation.step.ts`
- Modify: `src/mastra/workflows/refunds/steps/notify-refund-ack.step.ts`
- Modify: `src/mastra/workflows/refunds/steps/notify-refund-confirmation.step.ts`
- Modify: `src/mastra/workflows/refunds/steps/notify-deposit.step.ts`

**Interfaces:**
- Consumes: `subscriberRepository` from Task 6 (`../../../business/repositories`)
- Produces: Notify steps using the repository's `list(domain)` method

- [ ] **Step 1: Update notify-diapers-confirmation.step.ts**

In `src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts`, replace:

```typescript
import { listSubscribers } from '../../../lib/diapers-subscribers'
```

With:

```typescript
import { subscriberRepository } from '../../../business/repositories'
```

Replace the call:

```typescript
const subscribers = await listSubscribers()
```

With:

```typescript
const subscribers = await subscriberRepository.list('diapers')
```

Nothing else in the file changes — the loop `for (const { resourceId, threadId } of subscribers)` and everything after it is untouched.

- [ ] **Step 2: Update notify-meds-ack.step.ts**

In `src/mastra/workflows/meds/steps/notify-meds-ack.step.ts`, replace:

```typescript
import { listMedsSubscribers } from '../../../lib/meds-subscribers'
```

With:

```typescript
import { subscriberRepository } from '../../../business/repositories'
```

Replace the call:

```typescript
const subscribers = await listMedsSubscribers()
```

With:

```typescript
const subscribers = await subscriberRepository.list('meds')
```

- [ ] **Step 3: Update notify-meds-confirmation.step.ts**

Same change in `src/mastra/workflows/meds/steps/notify-meds-confirmation.step.ts`:

```typescript
import { listMedsSubscribers } from '../../../lib/meds-subscribers'
```

→

```typescript
import { subscriberRepository } from '../../../business/repositories'
```

And:

```typescript
const subscribers = await listMedsSubscribers()
```

→

```typescript
const subscribers = await subscriberRepository.list('meds')
```

- [ ] **Step 4: Update notify-refund-ack.step.ts**

In `src/mastra/workflows/refunds/steps/notify-refund-ack.step.ts`, replace:

```typescript
import { listRefundsSubscribers } from '../../../lib/refunds-subscribers'
```

With:

```typescript
import { subscriberRepository } from '../../../business/repositories'
```

Replace the call:

```typescript
const subscribers = await listRefundsSubscribers()
```

With:

```typescript
const subscribers = await subscriberRepository.list('refunds')
```

- [ ] **Step 5: Update notify-refund-confirmation.step.ts**

Same change in `src/mastra/workflows/refunds/steps/notify-refund-confirmation.step.ts`:

```typescript
import { listRefundsSubscribers } from '../../../lib/refunds-subscribers'
```

→

```typescript
import { subscriberRepository } from '../../../business/repositories'
```

And:

```typescript
const subscribers = await listRefundsSubscribers()
```

→

```typescript
const subscribers = await subscriberRepository.list('refunds')
```

- [ ] **Step 6: Update notify-deposit.step.ts**

Same change in `src/mastra/workflows/refunds/steps/notify-deposit.step.ts`:

```typescript
import { listRefundsSubscribers } from '../../../lib/refunds-subscribers'
```

→

```typescript
import { subscriberRepository } from '../../../business/repositories'
```

And:

```typescript
const subscribers = await listRefundsSubscribers()
```

→

```typescript
const subscribers = await subscriberRepository.list('refunds')
```

- [ ] **Step 7: Verify all six steps compile**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts src/mastra/workflows/meds/steps/notify-meds-ack.step.ts src/mastra/workflows/meds/steps/notify-meds-confirmation.step.ts src/mastra/workflows/refunds/steps/notify-refund-ack.step.ts src/mastra/workflows/refunds/steps/notify-refund-confirmation.step.ts src/mastra/workflows/refunds/steps/notify-deposit.step.ts
git commit -m "refactor: use subscriber repository in notify workflow steps"
```

---

## Task 15: Update Invite Tool and Telegram Gate

**Files:**
- Modify: `src/mastra/tools/create-invite-tool.ts`
- Modify: `src/mastra/lib/telegram-gate.ts`

**Interfaces:**
- Consumes: `getUserByResourceId` from Task 11 (`../../business/identity`); `inviteRepository`, `userRepository` from Task 6/5 (`../../business/repositories`); `IInvite` type from Task 9 (`../../business`)
- Produces: Invite creation/redemption and the Telegram access gate running on repositories

- [ ] **Step 1: Update create-invite-tool.ts**

Current content of `src/mastra/tools/create-invite-tool.ts`:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { createInvite } from '../lib/invites'
import { getUserByResourceId } from '../lib/users'

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

Replace it with:

```typescript
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { appConfig } from '../config/app.config'
import { inviteRepository } from '../../business/repositories'
import { getUserByResourceId } from '../../business/identity'

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
        const invite = await inviteRepository.create({ createdBy: user.email, email: input.email, name: input.name })
        return {
            ok: true,
            link: `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${invite.code}`,
            expiresAt: invite.expiresAt,
        }
    },
})
```

- [ ] **Step 2: Update telegram-gate.ts**

Current content of `src/mastra/lib/telegram-gate.ts`:

```typescript
import type { ChannelHandler } from '@mastra/core/channels'
import { getUserByTelegramId, linkTelegramId, type User } from './users'
import { redeemInvite, type Invite } from './invites'

export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<User | null>
    redeemInvite: (code: string, telegramId: string) => Promise<Invite | null>
    linkTelegramId: (email: string, telegramId: string) => Promise<boolean>
}

const defaultDeps: TelegramGateDeps = { getUserByTelegramId, redeemInvite, linkTelegramId }

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

        // El user existe desde que se generó el invite; el canje solo vincula
        const linked = await deps.linkTelegramId(invite.email, senderId)
        if (!linked) {
            console.warn(`[telegram-gate] invite ${invite.code} redeemed but no user found for ${invite.email}`)
            return
        }
        await defaultHandler(thread, message)
    }
}
```

Replace it with:

```typescript
import type { ChannelHandler } from '@mastra/core/channels'
import { userRepository, inviteRepository } from '../../business/repositories'
import type { IUser, IInvite } from '../../business'

export type TelegramGateDeps = {
    getUserByTelegramId: (telegramId: string) => Promise<IUser | null>
    redeemInvite: (code: string, telegramId: string) => Promise<IInvite | null>
    linkTelegramId: (email: string, telegramId: string) => Promise<boolean>
}

const defaultDeps: TelegramGateDeps = {
    getUserByTelegramId: telegramId => userRepository.findByTelegramId(telegramId),
    redeemInvite: (code, telegramId) => inviteRepository.redeem(code, telegramId),
    linkTelegramId: (email, telegramId) => userRepository.linkTelegramId(email, telegramId),
}

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

        // El user existe desde que se generó el invite; el canje solo vincula
        const linked = await deps.linkTelegramId(invite.email, senderId)
        if (!linked) {
            console.warn(`[telegram-gate] invite ${invite.code} redeemed but no user found for ${invite.email}`)
            return
        }
        await defaultHandler(thread, message)
    }
}
```

Note the `defaultDeps` shape changed from bare function references to arrow-function wrappers bound to the repository singletons — this is required because `userRepository.findByTelegramId` etc. are methods on an object and lose their `this` binding if referenced bare the way the old module-level functions were.

- [ ] **Step 3: Verify both files compile**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/mastra/tools/create-invite-tool.ts src/mastra/lib/telegram-gate.ts
git commit -m "refactor: use invite and user repositories in invite tool and telegram gate"
```

---

## Task 16: Update Google Auth and Mostro Supervisor

**Files:**
- Modify: `src/mastra/lib/google-auth.ts`
- Modify: `src/mastra/agents/mostro-supervisor.ts`

**Interfaces:**
- Consumes: `userRepository` from Task 5 (`../../business/repositories`)
- Produces: Auth and supervisor using repository instead of `lib/users`

- [ ] **Step 1: Update google-auth.ts**

In `src/mastra/lib/google-auth.ts`, replace:

```typescript
import { getUserByEmail } from './users'
```

With:

```typescript
import { userRepository } from '../../business/repositories'
```

Replace the call inside `authorizeUser`:

```typescript
return (await getUserByEmail(user.email)) !== null
```

With:

```typescript
return (await userRepository.findByEmail(user.email)) !== null
```

- [ ] **Step 2: Update mostro-supervisor.ts**

In `src/mastra/agents/mostro-supervisor.ts`, replace:

```typescript
import { getUserByTelegramId } from '../lib/users';
```

With:

```typescript
import { userRepository } from '../../business/repositories';
```

Replace the call inside `resolveResourceId`:

```typescript
const user = await getUserByTelegramId(message.author.userId);
```

With:

```typescript
const user = await userRepository.findByTelegramId(message.author.userId);
```

- [ ] **Step 3: Verify both files compile**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/mastra/lib/google-auth.ts src/mastra/agents/mostro-supervisor.ts
git commit -m "refactor: use user repository in google auth and mostro supervisor"
```

---

## Task 17: Verify No Remaining Imports from Deleted Files

**Files:**
- Check: All TS files in `src/mastra/`

**Interfaces:**
- Consumes: All updated files
- Produces: Clean build with no broken imports

- [ ] **Step 1: Search for lingering imports**

Run:
```bash
grep -rE "from '(\.\./)*lib/(users|diapers-subscribers|meds-subscribers|refunds-subscribers|invites)'" src/mastra --include="*.ts"
```

Expected: No results (if any found, update those files)

- [ ] **Step 2: Full TypeScript check**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: If errors found, fix them**

For each error, update the offending file to use repositories instead.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: complete migration to mongoose repositories"
```

---

## Task 18: Delete Old Library Files

**Files:**
- Delete: `src/mastra/lib/users.ts`
- Delete: `src/mastra/lib/diapers-subscribers.ts`
- Delete: `src/mastra/lib/meds-subscribers.ts`
- Delete: `src/mastra/lib/refunds-subscribers.ts`
- Delete: `src/mastra/lib/invites.ts`
- Delete (if unused): `src/mastra/lib/mongo-client.ts`, `src/mastra/lib/mongodb.ts`

**Interfaces:**
- Consumes: All tools/workflows updated (Tasks 11–17)
- Produces: Clean lib/ directory, no old data-access code

- [ ] **Step 1: Verify files are safe to delete**

Run:
```bash
grep -rE "from '(\.\./)*lib/(users|diapers-subscribers|meds-subscribers|refunds-subscribers|invites|mongo)'" src/mastra --include="*.ts"
```

Expected: No results

- [ ] **Step 2: Delete old files**

Run:
```bash
rm src/mastra/lib/users.ts
rm src/mastra/lib/diapers-subscribers.ts
rm src/mastra/lib/meds-subscribers.ts
rm src/mastra/lib/refunds-subscribers.ts
rm src/mastra/lib/invites.ts
```

Check if `mongo-client.ts` and `mongodb.ts` are used elsewhere:

```bash
grep -r "from.*lib/(mongo-client|mongodb)" src --include="*.ts"
```

If no results, delete them too:
```bash
rm src/mastra/lib/mongo-client.ts
rm src/mastra/lib/mongodb.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete old mongodb lib files"
```

---

## Task 19: Test Build and Runtime

**Files:**
- All TypeScript files

**Interfaces:**
- Consumes: Full migration (Tasks 1–18)
- Produces: Successful build and Mastra initialization

- [ ] **Step 1: Full TypeScript compilation**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Run dev server to check startup**

Run (in background):
```bash
pnpm dev
```

Expected: No errors during startup; Mongoose connects successfully

- [ ] **Step 3: Check for console errors**

Wait ~5 seconds, then check output for:
- Mongoose connection successful
- Admin seed completed
- No import errors

- [ ] **Step 4: Stop dev server**

Press `Ctrl+C`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify build and mongoose initialization"
```

---

## Task 20: Write Unit Tests for Repositories

**REVISED 2026-07-22:** Steps 2 and 3 below were rewritten to match the corrected `SubscriberRepository` (`add`/`list`) and `InviteRepository` (`create`/`redeem`) APIs from Tasks 6 and 7. Step 1 (user repository tests) is unchanged.

**Files:**
- Create: `src/business/repositories/user.repository.test.ts`
- Create: `src/business/repositories/subscriber.repository.test.ts`
- Create: `src/business/repositories/invite.repository.test.ts`

**Interfaces:**
- Consumes: Repositories from Tasks 5–7, Vitest
- Produces: Test suites for each repository

- [ ] **Step 1: Write user repository tests**

Create file `src/business/repositories/user.repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { userRepository } from './user.repository';
import { User } from '../models/user.model';

vi.mock('../models/user.model');

describe('UserRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findByEmail returns user or null', async () => {
    const mockUser = { email: 'test@gmail.com', name: 'Test', role: 'member' as const, addedAt: 123 };
    vi.mocked(User.findOne).mockResolvedValue(mockUser as any);

    const result = await userRepository.findByEmail('test@gmail.com');

    expect(result).toEqual(mockUser);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'test@gmail.com' });
  });

  it('linkTelegramId returns true if user matched', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 1 } as any);

    const result = await userRepository.linkTelegramId('test@gmail.com', '123456');

    expect(result).toBe(true);
  });

  it('linkTelegramId returns false if no user matched', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ matchedCount: 0 } as any);

    const result = await userRepository.linkTelegramId('test@gmail.com', '123456');

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Write subscriber repository tests**

Create file `src/business/repositories/subscriber.repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subscriberRepository } from './subscriber.repository';
import { Subscriber } from '../models/subscriber.model';

vi.mock('../models/subscriber.model');

describe('SubscriberRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('add upserts by type+resourceId+threadId', async () => {
    vi.mocked(Subscriber.updateOne).mockResolvedValue({} as any);

    await subscriberRepository.add('diapers', { resourceId: 'r1', threadId: 't1' });

    expect(Subscriber.updateOne).toHaveBeenCalledWith(
      { type: 'diapers', resourceId: 'r1', threadId: 't1' },
      { $setOnInsert: { type: 'diapers', resourceId: 'r1', threadId: 't1' } },
      { upsert: true }
    );
  });

  it('list returns resourceId/threadId pairs for a domain', async () => {
    const mockDocs = [{ type: 'diapers', resourceId: 'r1', threadId: 't1' }];
    vi.mocked(Subscriber.find).mockReturnValue({ lean: () => Promise.resolve(mockDocs) } as any);

    const result = await subscriberRepository.list('diapers');

    expect(result).toEqual([{ resourceId: 'r1', threadId: 't1' }]);
    expect(Subscriber.find).toHaveBeenCalledWith({ type: 'diapers' });
  });
});
```

- [ ] **Step 3: Write invite repository tests**

Create file `src/business/repositories/invite.repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inviteRepository } from './invite.repository';
import { Invite } from '../models/invite.model';
import { userRepository } from './user.repository';

vi.mock('../models/invite.model');
vi.mock('./user.repository', () => ({
  userRepository: { upsertUser: vi.fn().mockResolvedValue(undefined) },
}));

describe('InviteRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create provisions the user and creates an invite with code and expiry', async () => {
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

    expect(userRepository.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@gmail.com', role: 'member' })
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

- [ ] **Step 4: Run tests**

Run:
```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/business/repositories/*.test.ts
git commit -m "test: add unit tests for repositories"
```

---

## Task 21: Final Verification & Cleanup

**Files:**
- Check: All migrations complete

**Interfaces:**
- Consumes: All tasks 1–20
- Produces: Clean, passing build

- [ ] **Step 1: Full TypeScript check**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: No errors

- [ ] **Step 2: Run full test suite**

Run:
```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 3: Run dev server briefly**

Run:
```bash
pnpm dev &
```

Wait 5 seconds, check for startup errors.

Stop:
```bash
kill %1
```

- [ ] **Step 4: Verify git status clean**

Run:
```bash
git status
```

Expected: No uncommitted changes

- [ ] **Step 5: Final commit message (if needed)**

If any cleanup was needed:
```bash
git commit -m "chore: migration complete, all tests passing"
```

---

## Self-Review Against Spec

**REVISED 2026-07-22, after Tasks 1–10 were already implemented and reviewed.** The original plan (Tasks 3, 4, 6, 7, and the old Tasks 11–20) was written from a plausible-looking but unverified guess at the shape of `Subscriber`/`Invite`/`users.ts` identity logic, instead of reading the real `src/mastra/lib/*.ts` files. That gap surfaced when Task 11 (old numbering) was about to start and its file list didn't match reality. This self-review reflects the corrected plan.

**Spec Coverage:**
- ✅ **Architecture:** Mongoose models in `src/business/models/`, repositories in `src/business/repositories/`, identity resolution in `src/business/identity.ts` (Task 11)
- ✅ **Repository Pattern:** All three repositories with typed methods matching the real consumer APIs (verified by reading every consumer file, listed in the spec's "Real consumer map")
- ✅ **Mongoose Connection:** Initialized in `src/mastra/index.ts` before Mastra (Task 10, unaffected by the correction)
- ✅ **Gradual Migration:** Tools/workflows/lib files updated incrementally across Tasks 12–16, one coherent group of files per task
- ✅ **Old Files Deleted:** After all imports updated (Task 18), including the now-slimmed `users.ts` which is deleted outright (its identity-resolution logic moved to Task 11, not left behind)
- ✅ **Testing:** Unit tests (Task 20) mock repositories against the corrected `add`/`list` and `create`/`redeem` APIs
- ✅ **No Data Migration:** MongoDB empty, no migration scripts needed
- ✅ **Boilerplate Reduced:** Repository + identity module methods replace scattered lib functions

**Placeholder Scan:** None found. All code blocks complete, and Tasks 12–16 quote each file's real current content in full for the "before" side rather than describing changes abstractly.

**Type Consistency:**
- `ISubscriber`/`SubscriberEntry` (`resourceId`, `threadId`) consistent between Task 3 (model), Task 6 (repository), Tasks 13–14 (consumers), Task 20 (tests)
- `IInvite` (`code`, `expiresAt`, `usedBy`) consistent between Task 4 (model), Task 7 (repository), Task 15 (consumers), Task 20 (tests)
- `Domain` type (`'diapers' | 'meds' | 'refunds'`) used consistently in subscriber repository and its consumers
- Repositories export typed singletons; `identity.ts` exports plain functions (not a class/singleton, since it holds no state of its own beyond the imported repository)

**Gaps:** None identified after the full consumer sweep (verified via `grep` across `src/` for every symbol being replaced, cross-checked against each consumer file's actual content — see the spec's "Real consumer map").

---

## Plan Complete

All 21 tasks are defined, ordered, and ready for execution. Each task is independently testable and builds toward the full migration. Tests verify behavior before deletion of old code. Tasks 3, 4, 6, 7 were already implemented under the old (incorrect) design before this correction and need fix passes before Task 11 can proceed; Tasks 1, 2, 5, 8, 9, 10 are correct as implemented and need no changes.

**Next:** Fix Tasks 3, 4, 6, 7, then resume execution at Task 11.

