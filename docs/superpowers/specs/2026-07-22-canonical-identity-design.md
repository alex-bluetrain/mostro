# Identidad canónica por email de Google

**Fecha:** 2026-07-22
**Estado:** Aprobado
**Supersede:** `2026-07-21-user-identity-design.md` en el modelo de datos y la autorización (el gate de acceso, invitaciones por deep link, roles y `requestedBy` siguen vigentes; acá solo cambia su implementación).

## Contexto y objetivo

La feature telegram-first dejó la identidad keyed por `telegramId` (enfoque B), con la deuda explícita de que la memoria quedaba partida por canal. Con Google auth ya instalado en el server (allowlist por email), existe una identidad verificable para anclar todo: **el email de Google pasa a ser el ID canónico del usuario**. La memoria de agentes queda a nombre del email, y cuando llegue la web React el mismo login de Google comparte memoria e historial sin migración.

Decisiones tomadas:

1. **ID canónico = email de Google** (lowercase). Legible y 1:1 con el login web. Si alguien cambia de email, se migra a mano (caso rarísimo en Gmail personal).
2. **La invitación lleva el email del destinatario** (y opcionalmente su nombre). El user se crea al generar el invite; el canje del deep link solo vincula el `telegramId`.
3. **Autorización web = existir en `users`.** La env var `GOOGLE_ALLOWED_EMAILS` se elimina; un solo lugar de verdad.
4. **Borrón y cuenta nueva** (de nuevo): threads de memoria, suscripciones JSON y los docs de `users`/`invites` creados en la etapa telegram-first se descartan (data de prueba). Las colecciones se limpian a mano como paso de rollout.

## 1. Modelo de datos

### `users` (v2 — keyed por email)

```ts
{
  email: string        // canónico, lowercase, clave natural
  name: string
  role: 'admin' | 'member'
  telegramId?: string  // vinculado al canjear el invite (o por seed para el admin)
  addedAt: number      // unix timestamp
}
```

- El admin se siembra desde `.env`: `ADMIN_EMAIL` (requerido para el seed; sin él, warning y skip), `ADMIN_NAME`, `ADMIN_TELEGRAM_ID` (vincula su Telegram). El seed no pisa `name`/`role` existentes (`$setOnInsert`) pero sí re-vincula `telegramId` (`$set`, idempotente) — esto además resuelve el no-op de la etapa anterior para el vínculo.

### `invites` (v2)

```ts
{
  code: string         // aleatorio URL-safe (deep link)
  email: string        // destinatario: a quién vincula este invite
  name?: string        // nombre provisto por el admin al invitar
  createdBy: string    // email del admin que lo generó
  createdAt: number
  expiresAt: number    // 7 días
  usedBy?: string      // telegramId que lo canjeó
}
```

- Al **crear** un invite se hace upsert del user destinatario (`email`, `name ?? ''`, `role: 'member'`, sin `telegramId`). Desde ese momento la persona ya puede loguearse a la web.
- Canje: atómico como hoy (sin usar + vigente); al canjear se setea `users.telegramId` del email destinatario con el sender. Re-invitar a un email ya existente re-vincula su Telegram (cambio de teléfono), mismo usuario, misma memoria.

## 2. Resolución de identidad (`parseResourceId`)

Un `resourceId` puede llegar en dos formatos y la resolución debe entender ambos:

- `telegram:<id>` — threads legacy / default de channels (fallbacks).
- `<email>` (contiene `@`) — canónico, threads nuevos y futura web.

Helper puro `parseResourceId(resourceId)` → `{ kind: 'telegram', telegramId } | { kind: 'email', email } | null`, y `getUserByResourceId` resuelve contra el campo correspondiente. Todas las piezas que hoy usan `resourceId` (setMyNameTool, `requestedBy`, permisos de `createInviteTool`) pasan por acá y no cambian su contrato.

## 3. Memoria canónica (`resolveResourceId`)

Hook `resolveResourceId` en la config de channels del supervisor:

- Mensaje en **DM**: buscar user por `telegramId` del sender → retornar su `email`. Si no se resuelve (carrera rara, user sin vincular), retornar `ctx.defaultResourceId` (fail-safe: el thread queda con el default `telegram:<id>` y sigue funcionando).
- **No-DM** (grupos): retornar `ctx.defaultResourceId` (sin cambio de comportamiento).

Nota de Mastra: el hook corre solo al **crear** un thread; threads existentes conservan su dueño. Con el borrón y cuenta nueva esto no afecta a nadie.

## 4. Gate de Telegram (cambios mínimos)

Mismo flujo del spec anterior (registrado → pasa; desconocido → solo `/start CODIGO`; resto silencio). Cambia la implementación del canje:

- Lookup de conocido: user cuyo `telegramId` = sender.
- Canje válido → `redeemInvite` (atómico, igual) → **vincular** `telegramId` al user del `invite.email` (ya no se crea un user nuevo acá; el user existe desde que se generó el invite).

## 5. Google auth (autorización por colección)

`authorizeUser` pasa de la allowlist en env a: email verificado + `getUserByEmail(email)` existe. `GOOGLE_ALLOWED_EMAILS` se elimina de config y `.env.example`. Todo lo demás del auth (rutas públicas, webhook de Telegram, `requiresAuth: false` en `/webhooks/*`) queda igual.

## 6. Tools

- `createInviteTool`: input pasa a `{ email, name? }` (con validación de email). Sigue siendo admin-only por `resourceId`. Devuelve el mismo link `t.me/<bot>?start=CODIGO`. Las instrucciones del supervisor se actualizan: al invitar, pedir el email del invitado (y su nombre si lo saben).
- `setMyNameTool`: mismo contrato; internamente actualiza por `parseResourceId` (email o telegramId).

## 7. Fuera de alcance

- Vinculación de más proveedores de identidad (solo Google + Telegram).
- Migración de threads/suscripciones/docs existentes (se limpian a mano).
- Cambio de email de un usuario (migración manual si pasa).
- UI web (el login ya queda listo para cuando exista).

## 8. Testing y verificación

**Unit (vitest, sin Mongo vivo):**
- `parseResourceId`: telegram, email, basura, vacío.
- Gate: mismos escenarios de siempre con deps fakes, ahora con `linkTelegramId` en lugar de `createUser` en el canje.
- Se elimina el test de `parseAllowedEmails` (la función muere con la env var).

**Manual (rollout):**
- Limpiar colecciones `users`/`invites` y suscripciones JSON de prueba.
- Seed del admin con email+telegram; login en Studio con tu Google (autorizado) y con otra cuenta (401).
- Invitar con email → el invitado canjea → verificar en Mongo el vínculo y que el thread nuevo de memoria queda a nombre del email.
- Un pedido muestra `requestedBy` con el nombre correcto.

## Alternativas descartadas

- **Google `sub` como canónico**: estable pero opaco, y desconocido hasta el primer login web — rompe la vinculación por invite.
- **userId propio + identities[]**: máxima flexibilidad, indirección innecesaria para dos proveedores conocidos y un grupo chico.
- **Allowlist env + colección en paralelo**: dos lugares de verdad que se desincronizan.
