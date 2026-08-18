# Studio contra producción

Cómo entrar a Mastra Studio en el servidor de producción
(`https://<PROD_DOMAIN>`), el problema de licenciamiento que existía con auth de terceros, y
la solución implementada.

**TL;DR**: entrá a `https://<PROD_DOMAIN>/` y logueate con la `STUDIO_API_KEY` como
password (el email se ignora).

Dos piezas lo hacen posible:

1. **SimpleAuth** (activado por la env var `STUDIO_API_KEY`): la UI de login de Studio con un
   provider de terceros está gateada por licencia Enterprise Edition, y `SimpleAuth` está
   **exento** de ese gate.
2. **Studio servido desde el mismo origen que la API** (`mastra build --studio`): la cookie de
   sesión es `SameSite=Lax` y el browser no la manda cross-site, así que Studio local apuntando
   a prod quedaba en loop de login.

---

## 1. El problema: auth de terceros + Studio en prod requiere licencia EE

Studio decide qué UI de login mostrar llamando a `GET /api/auth/capabilities`. La respuesta la
arma `buildCapabilities()` en `@mastra/core`, que aplica este gate:

```js
const isLicensedOrCloud = hasLicense || isCloud || isSimple || isDev;
// ...
if (implementsInterface(auth, "getCurrentUser") && isLicensedOrCloud) {
  user = await auth.getCurrentUser(request);
}
```

El usuario del request **solo se resuelve** si se cumple alguna de estas:

| Condición | Con un provider de SSO en prod |
|---|---|
| `hasLicense` — licencia EE válida | ❌ no tenemos |
| `isCloud` — deploy en Mastra Cloud | ❌ VM propia |
| `isSimple` — provider es `SimpleAuth` | ✅ **la solución implementada** |
| `isDev` — `NODE_ENV != production` | ❌ en prod no |

Con un provider de SSO en prod, capabilities devolvía `{"enabled":true,"login":null}` aunque el
Bearer fuera válido, y Studio mostraba "no login method configured". Es intencional: la doc
oficial (`docs-studio-auth.md` en `@mastra/core`) dice que Studio Auth con providers de
terceros en producción requiere licencia EE — **pero funciona gratis en dev y con SimpleAuth**.
`SimpleAuth` lleva el marker `isSimpleAuth = true` justamente para eximirlo del gate.

El gate cubre sólo el **login UI**: `hasSSO` requiere que el provider implemente `getLoginUrl`, y
`hasCredentials` que implemente `signIn`. `MastraJwtAuth` no implementa ninguno de los dos —
valida un bearer y nada más — así que componerlo no toca la licencia.

## 2. La solución: JWT del BFF + SimpleAuth para Studio

`createServerAuth()` (`src/mastra/lib/server-auth.ts`) arma un `CompositeAuth` con dos entradas,
ambas por bearer token y ninguna gateada por licencia:

- **`MastraJwtAuth`** (`MOSTRO_JWT_SECRET`) → los usuarios finales, que entran por mostro-web. El
  BFF verifica el email contra Google y firma un JWT corto; acá sólo se valida la firma. Que la
  firma sea válida no alcanza: `authorizeUser` exige que el email exista en `users`, así que el
  acceso sigue siendo por invitación aunque mostro-web le dé sesión a cualquier cuenta de Google.
- **`SimpleAuth`** (`STUDIO_API_KEY`, prod vía Infisical) → Studio, con un único token que mapea a
  un admin estático. Min 32 chars. `SimpleAuth` soporta varios usuarios; declaramos uno solo
  porque el único consumidor hoy es Studio. Si sumás entradas, ojo con dos cosas:
  `authorizeUser()` acepta cualquier token del mapa para todo (no hay permisos por ruta ni por
  rol) y el mapa se arma en el constructor, así que dar de alta o revocar implica reiniciar.

`CompositeAuth` prueba los providers en orden y gana el primero que autentica; el JWT va primero
porque es el camino de todos los requests de usuario. Con un solo secret configurado se usa ese
provider directo, sin componer. Sin ninguno, el boot **falla**: un server sin auth es un bug de
config que conviene que duela en el arranque y no en el primer request.

La regex pública del webhook de Telegram (`TELEGRAM_CHANNEL_WEBHOOK`, exportada desde
`jwt-auth.ts`) se pasa a **ambos** providers: `CompositeAuth` une los `public` de todos, y ese
endpoint tiene su propia protección vía `TELEGRAM_WEBHOOK_SECRET_TOKEN` — si el middleware de
auth lo tapara, el bot deja de recibir updates.

> **Importante**: los Bearer ID tokens de Google ya **no** son aceptados por la API. Los
> credentials válidos son el JWT que firma el BFF y la `STUDIO_API_KEY`.

## 3. Cómo conectarse a prod

Studio se sirve **desde el propio servidor de prod**, en la raíz del dominio:

```text
https://<PROD_DOMAIN>/
```

Se entra con el form de login normal: cualquier email (se ignora) y la `STUDIO_API_KEY` como
password. No hace falta correr nada local, ni pasar la key por URL, ni tocar `localStorage`.

Esto lo habilita el flag `--studio` de `mastra build`, que agrega el frontend al output
(`.mastra/output/studio`, ~11 MB). El server lo sirve si encuentra la env var
`MASTRA_STUDIO_PATH`. Ambas cosas están fijadas en el `Dockerfile`:

```dockerfile
RUN pnpm build --studio
ENV MASTRA_STUDIO_PATH=/app/studio
```

### 3.1. Por qué el mismo origen es lo que hace andar el login

`SimpleAuth.signIn()` emite la sesión como cookie con `SameSite=Lax` (hardcodeado en
`@mastra/core`). Con `Lax`, el browser guarda la cookie pero **no la reenvía en requests
cross-site**.

Con Studio local (`localhost:3000`) apuntando a prod (`<PROD_DOMAIN>`) son sitios
distintos: el sign-in devolvía 200, pero el request siguiente iba sin credencial → 401 → loop de
login. No era CORS ni mala config: es una regla del browser.

Sirviendo Studio desde el mismo origen que la API, el request deja de ser cross-site y `Lax`
manda la cookie normalmente. **No se cambió nada del auth**: la cookie sigue siendo
`HttpOnly; SameSite=Lax` (verificado). Lo que cambió es el origen desde donde se pide.

### 3.2. Acceso directo a la API

```bash
curl -H "Authorization: Bearer <STUDIO_API_KEY>" https://<PROD_DOMAIN>/api/agents
```

⚠️ Studio contra prod es real: ejecuta tools reales (emails por Gmail), escribe en el MongoDB
de prod, consume tokens de API y muestra threads reales de Telegram.

## 4. Setup de la key en prod

1. Generar: `node -e "console.log('sk-' + require('crypto').randomBytes(32).toString('hex'))"`
2. Agregar `STUDIO_API_KEY` en Infisical (proyecto mostro, environment prod).
3. Restart del container en la VM para que tome el secret:
   `docker compose up -d --force-recreate app`

Para rotarla: cambiar el valor en Infisical y reiniciar. Las sesiones activas se invalidan solas
(la cookie *es* la key, y deja de validar).

## 5. Consideraciones de seguridad

Servir Studio en prod expone una consola de administración en internet. Mitigaciones y riesgos
asumidos:

- **La consola está detrás del auth gate**: sin la key, `/` sólo muestra el login. Todos los
  endpoints `/api/*` exigen credencial, salvo el webhook de Telegram (que tiene su propio
  secret token).
- **La key viaja por HTTPS** (Caddy con cert de Let's Encrypt) y queda en una cookie `HttpOnly`,
  invisible a JavaScript.
- **La `STUDIO_API_KEY` es un único credential compartido**, sin usuarios ni revocación
  individual: quien la tiene, tiene acceso total. Es la llave de admin, no la de los usuarios —
  esos entran por mostro-web con su Google, cada uno con su identidad y sujeto al allowlist.
- **La imagen crece ~11 MB** por los assets del frontend.

## 6. Alternativas descartadas (y por qué)

| Camino | Por qué no |
|---|---|
| Licencia EE | Camino oficial para SSO de terceros en prod, pero con costo no justificado para un proyecto personal |
| `CompositeAuth` con un provider de SSO | Pasa el gate técnicamente, pero "destraba" el login UI de terceros en prod sin licencia — el gris de licensing que queremos evitar. Componer con JWT no cae en esto: no aporta login UI (ver §2) |
| `MASTRA_DEV=true` en prod | Esquiva el gate de licencia — violación directa del licenciamiento EE |
| Parchear la cookie a `SameSite=None` | Requiere string-patchear un interno de `@mastra/core` (rompe en silencio si cambia el formato) y resigna la protección CSRF que da `Lax` |
| `auth_header` por URL / headers en `localStorage` | Funcionaban, pero la key viaja por historial del browser y queda en claro en `localStorage`; el panel de Settings además está detrás del propio auth gate |
| SSH tunnel | El puerto 4111 no está expuesto al host de la VM (solo a la red de docker-compose) |
| Bearer de Google + `auth_header` | El token era aceptado por la API, pero capabilities no resolvía el user por el gate EE — Studio inutilizable |
| Google SSO como provider de la API | Reemplazado por el JWT que firma el BFF de mostro-web: el login con Google ahora pasa por la web y Mostro sólo verifica firma + allowlist |

## 7. Referencias

- Doc oficial embebida: `node_modules/@mastra/core/dist/docs/references/docs-studio-auth.md`
  (quickstart con SimpleAuth y sección "EE licensing")
- Deploy de Studio y flag `--studio`:
  `node_modules/@mastra/core/dist/docs/references/docs-studio-deployment.md`
- SimpleAuth: `node_modules/@mastra/core/dist/docs/references/docs-server-auth-simple-auth.md`
- Gate de licencia: `buildCapabilities()` e `isSimpleAuth()` en `@mastra/core` (`dist/chunk-*.js`)
