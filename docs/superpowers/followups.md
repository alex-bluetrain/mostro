# Follow-ups pendientes

Lista viva de pendientes que no bloquean el trabajo ya commiteado. Origen: reviews de la feature de identidad de usuarios (spec `specs/2026-07-21-user-identity-design.md`, plan `plans/2026-07-21-user-identity.md`) y del agregado de Google auth (2026-07-22).

## Bloqueantes para dar por cerrada la feature de identidad

- [ ] **Rollout de identidad canónica + E2E manual** (specs 2026-07-21 y 2026-07-22; requiere dos cuentas de Telegram):
  1. ~~Limpiar data de prueba~~ — hecho el 2026-07-22: messages dropeados, `users` re-seedeada, JSONs de suscriptores borrados; no había memoria a nombre de `telegram:<id>`. Cosmético pendiente: 6 threads vacíos `mostro-supervisor*` en `mastra_threads` (pre-fix `1a0aa8b`), se limpian con `db.mastra_threads.deleteMany({resourceId: /^mostro-supervisor/})`.
  2. ~~`.env` con `ADMIN_*`~~ — hecho el 2026-07-22: seed verificado en Mongo (admin con `telegramId` vinculado) y el DM del admin ya crea threads a nombre del email.
  3. Verificar con la segunda cuenta: desconocido ignorado en silencio (DM, mención en grupo); invitar con email crea el user en Mongo; el canje del deep link vincula `telegramId`; link usado no se reusa; member no puede invitar; un pedido muestra `requestedBy`. (El thread a nombre del email ya se verificó con el admin.)
- [ ] **Activar Google auth**: credenciales `GOOGLE_*` ya completas en `.env` (2026-07-22). Falta probar: login en Studio con el admin y que una cuenta no invitada reciba 401. De paso borrar `GOOGLE_ALLOWED_EMAILS` del `.env`: ya no se lee (la autorización pasó a la colección `users` en `4126e03`).
- [ ] **Cerrar la rama `feat/refactor`**: merge a `main` o PR, cuando el E2E esté verde.

## Diferidos de las reviews (mejoras, no bloquean)

- [x] Índices únicos en Mongo: `users.email`, `users.telegramId` (sparse) e `invites.code` — hecho: se crean idempotentemente en `ensureAdminSeed()` (boot, corre siempre ahora, incluso sin `ADMIN_EMAIL`) y en `createInvite()` (antes del insert).
- [ ] Incluir `requestedBy` en los payloads de los `sendNotificationSignal` de los tres notify steps (hoy el nombre está en el estado y el agente puede decirlo si le preguntan, pero el aviso no nombra a quién pidió).
- [ ] Compensación si `linkTelegramId` falla (no matchea ningún user) después de `redeemInvite`: el invite queda quemado sin vincular; el gate ahora lo detecta, loguea un warning y no deja pasar al agente, pero el código no se puede reusar (ventana milimétrica; el admin puede regenerar el invite). Posible fix: try/catch que haga `$unset` de `usedBy`.
- [ ] `ensureAdminSeed()` usa `$setOnInsert`: cambiar `ADMIN_NAME` en `.env` con el admin ya creado es un no-op silencioso.
- [ ] Doble pool de Mongo: `lib/mongo-client.ts` abre su propio `MongoClient` además del interno de `MongoDBStore` (misma URI); sin `close()` en shutdown. Consolidar algún día.
- [ ] El gate compara contra `users.telegramId` pero está registrado a nivel `channels.handlers` (aplica a todo adapter): si algún día se suma otro canal, ese canal queda bloqueado en silencio (fail closed). Documentado en comentario; revisar al agregar adapters.
- [ ] Test de orden en el gate: nada asegura que `linkTelegramId` corra solo tras un `redeemInvite` exitoso si se refactoriza a concurrente.
- [ ] Casts `context.mastra as any` preexistentes en las request tools.

## Futuro (fuera de alcance por decisión de spec)

- ~~Identidad canónica cross-canal~~ → hecho el 2026-07-22 (spec `2026-07-22-canonical-identity-design.md`): email de Google como ID canónico, invites nominados, `resolveResourceId` en DMs. Queda para el futuro: otros proveedores de identidad, cambio de email de un usuario (migración manual), cache en `authorizeUser` si el login se pone lento.
- Roles finos por flujo, revocación de usuarios y administración avanzada.
