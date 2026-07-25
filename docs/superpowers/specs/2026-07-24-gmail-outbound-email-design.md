# Diseño: envío de correos desde Mastra vía Gmail API

Fecha: 2026-07-24

## Contexto

Los cuatro puntos de salida del sistema (`request-diapers`, `request-meds`, `request-refund`,
`confirm-deposit`) hacen hoy un `fetch` POST a una URL configurada por `DIAPERS_MESSAGING_URL`,
`MEDS_MESSAGING_URL` y `REFUNDS_MESSAGING_URL`. Ese mecanismo existía para delegar la
mensajería en una API externa propia. Esa decisión se revierte: Mostro envía los correos
directamente desde su propia cuenta de Gmail.

## Objetivo

- Reemplazar los cuatro `fetch` por envíos de correo reales a un destinatario fijo por dominio.
- Eliminar por completo el mecanismo `*_MESSAGING_URL`.
- Que las respuestas de los destinatarios caigan en el inbox de la cuenta de Mostro.

## Decisiones

- **Mecanismo:** Gmail API con OAuth2 y refresh token, scope `gmail.send`. Se descartó SMTP con
  app password (credencial de alcance amplio, atada a 2FA) y un proveedor transaccional tipo
  Resend (requiere dominio propio y el correo dejaría de salir de la dirección que los
  destinatarios conocen).
- **Cliente OAuth propio del mailer:** distinto del que usa el SSO, aunque puede vivir en el mismo
  proyecto de Google Cloud. Revisado el 2026-07-25: la decisión original pedía además un proyecto
  aparte, con el argumento de que publicar la app con un scope sensible cambiaría la pantalla de
  consentimiento del login. Es falso — el consentimiento se pide por los scopes de cada solicitud,
  y el login solo pide `openid email profile`. Lo que un proyecto compartido sí comparte es el
  cupo de 100 usuarios de una app sin verificar, el trámite de verificación y el radio de una
  suspensión; nada de eso pesa a escala familiar, así que se usa un solo proyecto.
- **Librería:** `@googleapis/gmail`, la variante modular del SDK oficial. Mismo código generado
  y misma llamada `users.messages.send` que `googleapis`, sin arrastrar las demás APIs de Google
  al build.
- **Contenido determinista:** el cuerpo y el asunto se arman en código a partir de los datos del
  pedido. El LLM no redacta correos.
- **Destinatario fijo por dominio:** una dirección por dominio, por configuración.
- **Configuración requerida:** sin credenciales de Gmail el server no arranca.
- **Solo salida:** leer el inbox queda fuera de alcance.

## Componentes nuevos

### `src/mastra/lib/mailer/gmail-mailer.ts`

Único módulo que habla con Google. Expone:

```ts
sendEmail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<void>
```

Construye una sola vez un `OAuth2Client` con `GMAIL_MAILER_CLIENT_ID`, `GMAIL_MAILER_CLIENT_SECRET` y
`GMAIL_MAILER_REFRESH_TOKEN`; el SDK renueva el access token por su cuenta. Llama a
`users.messages.send` con `userId: 'me'` y el mensaje en `raw`.

Reintentos: hasta 2 reintentos con backoff exponencial ante fallos de red, timeout, `429` y
`5xx`. Ante `4xx` corta en el primer intento — un token revocado o un destinatario inválido no
mejoran esperando. **No** se usa `retries` a nivel step de Mastra: multiplicaría los intentos.

Traducción de errores: un `invalid_grant` se convierte en un error cuyo mensaje nombra el
remedio ("el refresh token de Gmail ya no es válido: regenerarlo con `pnpm run gmail:auth` y
verificar que la app OAuth esté publicada en producción").

### `src/mastra/lib/mailer/mime.ts`

Función pura que arma el mensaje RFC 2822 y lo codifica en base64url, que es lo que la API de
Gmail espera en `raw`. Responsabilidades:

- Headers `From`, `To`, `Subject`, `Content-Type: text/plain; charset=UTF-8`, separados por CRLF.
- Asunto codificado en RFC 2047 (`=?UTF-8?B?...?=`) para que los acentos no lleguen rotos.
- base64url con alfabeto `-_` y sin padding.

### `src/mastra/lib/mailer/templates/`

Un archivo por dominio (`diapers.ts`, `meds.ts`, `refunds.ts`), cada uno exportando funciones
puras `(datos) => { subject: string; text: string }`. Cuatro plantillas en total, una por punto
de envío.

El asunto lleva el identificador del run — por ejemplo `[Mostro] Pedido de pañales 2026-07` —
para que una respuesta humana sea rastreable. El identificador sale del `runId` que el `execute`
del step ya recibe en su contexto (`diapers-2026-07`, `meds-2026-07`, `refunds-2026-07`), así
que ningún schema de input necesita cambiar.

### `scripts/gmail-authorize.mjs` (`pnpm run gmail:auth`)

Script de setup, se corre una vez. Imprime la URL de consentimiento, levanta un servidor
efímero en `localhost` para recibir el callback (flujo loopback; el flujo OOB está deprecado por
Google) e imprime el refresh token por consola para pegarlo en el `.env`.

Va en JavaScript plano para no depender de un runner de TypeScript, y se ejecuta con
`node --env-file=.env`, porque fuera de `mastra dev` el `.env` no se carga solo.

## Configuración

Se eliminan de `app.config.ts`, `.env.example` y el README:

```
DIAPERS_MESSAGING_URL
MEDS_MESSAGING_URL
REFUNDS_MESSAGING_URL
```

Se agregan como **requeridas** (`z.string().min(1)`, sin `.optional()`):

| Variable                     | Contenido                                   |
| ---------------------------- | ------------------------------------------- |
| `GMAIL_MAILER_CLIENT_ID`     | Cliente OAuth del proyecto del mailer       |
| `GMAIL_MAILER_CLIENT_SECRET` | Secret de ese cliente                       |
| `GMAIL_MAILER_REFRESH_TOKEN` | Obtenido con `pnpm run gmail:auth`          |
| `GMAIL_MAILER_SENDER`        | Dirección de Mostro; va en el header `From` |
| `DIAPERS_EMAIL_TO`           | Destinatario de los pedidos de pañales      |
| `MEDS_EMAIL_TO`              | Destinatario de los pedidos de medicamentos |
| `REFUNDS_EMAIL_TO`           | Destinatario de los reintegros              |

Las siete se agregan también a `tests/setup-env.ts`, que es donde el proyecto inyecta las
variables requeridas para vitest. Sin eso, hacerlas obligatorias rompe toda la suite.

Documentación a actualizar: el README (bloque de variables y el setup de Gmail descrito abajo) y
`diapers-flow.md`, cuyo diagrama nombra a `DIAPERS_MESSAGING_URL` como participante.

## Setup manual en Google Cloud

Pasos obligatorios, no opcionales:

1. Crear un proyecto de Google Cloud propio del mailer.
2. Habilitar la Gmail API.
3. Crear un cliente OAuth de tipo "Web application" con redirect a
   `http://127.0.0.1:53682/oauth2callback`. La URI debe coincidir exactamente con la que usa el
   script, puerto incluido; el script escucha en ese puerto fijo. Va `127.0.0.1` y no `localhost`
   porque en Windows `localhost` resuelve primero a `::1` y el script escucha solo en IPv4.
4. Agregar el scope `https://www.googleapis.com/auth/gmail.send`.
5. **Publicar la app en producción.** Si queda en modo *Testing*, el refresh token se invalida a
   los 7 días y los envíos empiezan a fallar. Al autorizar aparecerá la pantalla de "app no
   verificada", que se acepta manualmente; la verificación de Google solo hace falta para
   distribuir la app a terceros.
6. Correr `pnpm run gmail:auth` autenticándose con la cuenta de Mostro y guardar el refresh token
   en el `.env`.

## Cambios en los steps

Los cuatro steps siguen la misma forma: armar la plantilla, enviar, y **solo si el envío salió
bien**, avanzar el estado.

| Step               | Destinatario       | Contenido del correo                                    |
| ------------------ | ------------------ | ------------------------------------------------------- |
| `request-diapers`  | `DIAPERS_EMAIL_TO` | talle, quién pidió, mes del pedido                      |
| `request-meds`     | `MEDS_EMAIL_TO`    | lista de medicamentos, quién pidió, mes                 |
| `request-refund`   | `REFUNDS_EMAIL_TO` | monto, motivo, quién pidió, mes                         |
| `confirm-deposit`  | `REFUNDS_EMAIL_TO` | monto y fecha del depósito, referencia del reintegro    |

Dos cambios de comportamiento respecto de hoy:

**Se invierte el orden en los tres steps de request.** Hoy hacen `setState` y después el `fetch`:
si la salida falla, el estado ya dice `*_requested` aunque nadie se haya enterado del pedido. Con
el envío primero, un fallo deja el workflow sin avanzar y el pedido se puede reintentar limpio.
`confirm-deposit` ya tiene ese orden y lo conserva.

**Los correos llevan datos que hoy no viajan.** El `fetch` actual manda lo mínimo (`{ size }`,
`{ medications }`) porque del otro lado había una API con contexto propio. Ahora del otro lado hay
una persona, así que el cuerpo incluye quién pidió y a qué mes corresponde el pedido.

## Manejo de errores

`run.start()` no lanza cuando un step falla: devuelve `{ status: 'failed', error }`. Por eso el
fallo necesita traducirse explícitamente en cada capa:

1. El mailer agota sus reintentos y lanza.
2. El step propaga el error sin haber tocado el estado.
3. El run termina en `failed`.
4. `startDiapers`, `startMedsOrder` y `startRefundRequest` (en `lib/diapers-run.ts`,
   `lib/meds-run.ts`, `lib/refunds-run.ts`) pasan a detectar `result.status === 'failed'` y
   devolver la forma explícita que ya usan las tools del repo:
   `{ ok: false, reason: 'send_failed', message: 'No pude enviar el pedido...' }`. Hoy devuelven
   el `result` crudo, que el agente puede interpretar como éxito.
5. El agente comunica el fallo al usuario en Telegram.

**Reintento del usuario:** como el estado no avanzó, y el guard de los tres helpers solo bloquea
runs `suspended` o `running`, volver a pedirlo arranca un run limpio sin intervención manual.

**Camino sin usuario esperando:** `confirm-deposit` se dispara desde el webhook de depósito. El
fallo queda en el log del step con el error de Gmail, y `webhook-refunds-deposit.route.ts` pasa a
responder `502` cuando el resume termina en `failed`, para que el sistema externo pueda
reintentar. Hoy responde `200` sin mirar el status del run.

**Limitación conocida y trade-off aceptado:** ese `502` no habilita en la práctica un reintento
automático. Si el resume falla, el run de reembolso queda en `failed`, y `receiveDeposit`
(`lib/refunds-run.ts`) solo resume runs `suspended` — un reintento del webhook externo se
encuentra el run en `failed` y recibe `409`, no un nuevo intento de envío. El `502` sirve como
alerta para quien opera el sistema, no como señal de "reintentá y se arregla solo"; el reintegro
de ese mes queda trabado hasta que alguien intervenga a mano (por ejemplo, reabriendo el run o
completando el aviso por otra vía). Se acepta esta limitación: el caso es infrecuente y de bajo
volumen, y automatizar la recuperación de un run fallido no se justifica frente a la complejidad
que agregaría.

## Testing

| Nivel               | Qué se verifica                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mime.test.ts`      | base64url con alfabeto `-_` y sin padding; asunto con acentos en RFC 2047; headers separados por CRLF                                                              |
| Plantillas          | El asunto lleva el identificador del run; ningún dato faltante se cuela como el string `"undefined"` en el cuerpo                                                  |
| `gmail-mailer.test.ts` | Con `@googleapis/gmail` mockeado: llama a `users.messages.send` con `userId: 'me'` y el `raw` esperado; reintenta ante `503` y `429`; **no** reintenta ante `401` ni `403`; traduce `invalid_grant` al mensaje con el remedio |
| Steps               | Con el mailer mockeado: envío OK avanza el estado; envío fallido lanza y **no** llama a `setState`. Los steps se invocan directo con `inputData`, `state` y un `setState` espía, sin levantar el workflow |

Verificación manual, una sola vez: correr `pnpm run gmail:auth`, enviar un correo de prueba a la
propia cuenta y confirmar que llega con los acentos correctos. No se automatiza un test de
integración contra la API real: para cuatro correos al mes no se paga.

## Fuera de alcance

- Leer el inbox de Gmail o reanudar workflows a partir de respuestas por correo. Los webhooks
  actuales siguen siendo la única vía de retorno.
- Correos a los usuarios de la familia: las notificaciones a suscriptores siguen yendo por
  Telegram.
- Destinatarios dinámicos elegidos en runtime por el agente o el usuario.
- Adjuntos, HTML y multipart. Los correos son texto plano.
- Cambios en identity, invites o suscripciones.
