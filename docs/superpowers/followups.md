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
- [x] Doble pool de Mongo (`lib/mongo-client.ts` + `MongoDBStore`) — `mongo-client.ts` se borró en la migración a Mongoose (2026-07-22). Sigue habiendo dos pools (ver sección nueva abajo), pero ya no por este archivo.
- [ ] El gate compara contra `users.telegramId` pero está registrado a nivel `channels.handlers` (aplica a todo adapter): si algún día se suma otro canal, ese canal queda bloqueado en silencio (fail closed). Documentado en comentario; revisar al agregar adapters.
- [ ] Test de orden en el gate: nada asegura que `linkTelegramId` corra solo tras un `redeemInvite` exitoso si se refactoriza a concurrente.
- [ ] Casts `context.mastra as any` preexistentes en las request tools.

## Diferidos de la migración a Mongoose (2026-07-22)

Origen: spec `specs/2026-07-22-mongoose-business-models-design.md`, plan `plans/2026-07-22-mongoose-business-models.md` (21 tareas + 4 fixes de diseño + 1 fix del review final, rama `feat/mongoose-business-models`, mergeada a `main`). Migró User/Subscriber/Invite de MongoDB driver crudo a Mongoose + Repository pattern en `src/business/`.

- [ ] Los métodos de lectura de los repositories (`findByEmail`, `findByTelegramId` en `user.repository.ts`; `redeem` en `invite.repository.ts`) devuelven documentos Mongoose completos (con `_id`/`__v`) en vez de POJOs limpios con `.lean()`. Nadie los serializa hoy, no rompe nada, pero conviene limpiarlo si algún día se exponen por API.
- [ ] Comentario de `subscriberRepository.add()` dice que el upsert es "sin race" — en rigor dos upserts idénticos exactamente simultáneos pueden tirar un error E11000 en vez de un no-op silencioso (sigue siendo más seguro que el find-then-insert original, pero el comentario es impreciso).
- [ ] `setUserNameByResourceId()` en `src/business/identity.ts`, rama telegram, hace 2 queries (`findByTelegramId` + `setUserName` por email) en vez de la única query que hacía el código viejo — ventana TOCTOU teórica si se desvincula el telegram justo entre medio. Riesgo bajo, así lo requería la forma del repository.
- [ ] `tsconfig.json` no incluye `tests/`: si se borra/mueve un archivo fuente que un test importa, ni `tsc` ni un grep sobre `src/` lo detectan (pasó durante esta migración, Task 18, ya reparado). Considerar ampliar el `include` o sumar un `tsconfig.test.json` chequeado en CI.
- [ ] Dos pools de Mongo activos a la vez: `mongoose.connect()` (para los repositories nuevos) y el `MongoDBStore` interno de Mastra (`@mastra/mongodb`, storage propio del framework) — mismo Mongo, dos clientes separados, sin conflicto pero sin consolidar. Evaluar si vale la pena unificar.
- [ ] Test de `user.repository.test.ts` para `findByEmail` no ejercita el lowercasing (pasa un email ya en minúsculas); sí está cubierto indirectamente en `invite.repository.test.ts`.

## Diferidos de la rama `fix/telegram-start-invite-redeem` (2026-07-22)

Origen: review final de la rama que agrega el handler `/start` de canje de invitaciones por Telegram (`src/mastra/lib/telegram-start.ts`).

- [ ] `telegram-start.ts` no distingue chats de grupo: un desconocido que escribe `/start` en un grupo hace que el bot postee el mensaje de invite inválido públicamente; los deep links legítimos siempre abren DM. Posible fix: `return` temprano cuando `event.raw.chat.type !== 'private'`.
- [ ] `telegram-start.ts`: el `console.warn` de la rama "redeemed pero sin user" loguea el email del invitado; si se quiere endurecer privacidad, loguear solo `invite.code`.
- [ ] Cosmético: `post(INVALID_INVITE_MESSAGE)` se repite tres veces; el literal `validInvite` en `tests/telegram-start.test.ts` es largo y podría extraerse a un fixture.
- [ ] Los invites pendientes no se dedupean ni son revocables: invitar dos veces al mismo email genera dos códigos válidos de 7 días en paralelo (ninguno invalida al otro). El spec deja la revocación fuera de alcance a propósito; si hace falta, agregar un paso que invalide invites previos sin usar del mismo email al crear uno nuevo.

## Futuro (fuera de alcance por decisión de spec)

- ~~Identidad canónica cross-canal~~ → hecho el 2026-07-22 (spec `2026-07-22-canonical-identity-design.md`): email de Google como ID canónico, invites nominados, `resolveResourceId` en DMs. Queda para el futuro: otros proveedores de identidad, cambio de email de un usuario (migración manual), cache en `authorizeUser` si el login se pone lento.
- Roles finos por flujo, revocación de usuarios y administración avanzada.
