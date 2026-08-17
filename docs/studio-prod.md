# Studio contra producción

Cómo usar Mastra Studio local apuntando al servidor de producción
(`https://mostro-bot.duckdns.org`), el problema de licenciamiento que existía con Google SSO, y
la solución implementada.

**TL;DR**: la UI de Studio con un auth provider de terceros (`@mastra/auth-google`) en
producción está gateada por licencia Enterprise Edition. `SimpleAuth` está **exento** de ese
gate, así que prod usa SimpleAuth (activado por la env var `STUDIO_API_KEY`) y dev sigue usando
Google SSO. Studio local se conecta a prod con la key.

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

| Condición | Con MastraAuthGoogle en prod |
|---|---|
| `hasLicense` — licencia EE válida | ❌ no tenemos |
| `isCloud` — deploy en Mastra Cloud | ❌ VM propia |
| `isSimple` — provider es `SimpleAuth` | ✅ **la solución implementada** |
| `isDev` — `NODE_ENV != production` | ❌ en prod no |

Con `MastraAuthGoogle` en prod, capabilities devolvía `{"enabled":true,"login":null}` aunque el
Bearer fuera válido, y Studio mostraba "no login method configured". Es intencional: la doc
oficial (`docs-studio-auth.md` en `@mastra/core`) dice que Studio Auth con providers de
terceros en producción requiere licencia EE — **pero funciona gratis en dev y con SimpleAuth**.
`SimpleAuth` lleva el marker `isSimpleAuth = true` justamente para eximirlo del gate.

## 2. La solución: SimpleAuth en prod, Google SSO en dev

El provider se elige por entorno en `src/mastra/lib/server-auth.ts`:

- **`STUDIO_API_KEY` seteada** (prod, vía Infisical) → `SimpleAuth` con un único token que
  mapea a un usuario admin estático. Min 32 chars.
- **No seteada** (dev local) → `MastraAuthGoogle` con el invite gate de siempre
  (`createGoogleAuth()`), donde el gate EE no aplica porque `isDev` es true.
- Sin ninguna config → server sin auth (solo posible en dev).

La regex pública del webhook de Telegram (`TELEGRAM_CHANNEL_WEBHOOK`, exportada desde
`google-auth.ts`) se pasa a **ambos** providers: ese endpoint tiene su propia protección vía
`TELEGRAM_WEBHOOK_SECRET_TOKEN` y debe quedar fuera del middleware de auth o el bot deja de
recibir updates.

> **Importante**: con SimpleAuth activo en prod, los Bearer ID tokens de Google ya **no** son
> aceptados por la API. El único credential válido es `STUDIO_API_KEY`.

## 3. Cómo conectarse a prod

```bash
pnpm run studio:prod    # mastra studio -h mostro-bot.duckdns.org -s 443 -x https
```

Luego abrir Studio con la key por URL — Studio la consume, limpia la URL y la mantiene solo en
memoria:

```text
http://localhost:3000/?auth_header=Bearer%20<STUDIO_API_KEY>
```

### 3.1. El login screen no sirve contra prod (cookie cross-site)

Pegar la key en el form de login **no funciona** desde Studio local contra prod: el sign-in
devuelve 200 y redirige, pero al recargar la sesión no existe. Hay que usar `auth_header`.

Studio corre en `localhost:3000` y la API en `mostro-bot.duckdns.org`: son **sitios distintos**.
`SimpleAuth.signIn()` emite la cookie de sesión con `SameSite=Lax` hardcodeado, y con `Lax` el
browser acepta la cookie pero no la reenvía en requests cross-site.

No es CORS — los headers ya están bien (`Access-Control-Allow-Origin: http://localhost:3000` +
`Allow-Credentials: true`), y Studio ya hace todos sus fetches con `credentials: "include"`.

**No lo trabajamos alrededor a propósito.** Reescribir la cookie a `SameSite=None; Secure`
requiere parchear por string un detalle interno de `@mastra/core` (rompe en silencio si cambia
el formato) y encima resigna la protección CSRF que da `Lax`. `auth_header` resuelve lo mismo
sin persistir el token ni bajar la seguridad de prod. Si el form llega a hacer falta, el camino
sano es servir Studio y API bajo el mismo sitio.

Para la API directa (curl, `mastra api`):

```bash
curl -H "Authorization: Bearer <STUDIO_API_KEY>" https://mostro-bot.duckdns.org/api/agents
```

⚠️ Studio contra prod es real: ejecuta tools reales (emails por Gmail), escribe en el MongoDB
de prod, consume tokens de API y muestra threads reales de Telegram.

## 4. Setup de la key en prod

1. Generar: `node -e "console.log('sk-' + require('crypto').randomBytes(32).toString('hex'))"`
2. Agregar `STUDIO_API_KEY` en Infisical (proyecto mostro, environment prod).
3. Restart del container en la VM para que tome el secret:
   `docker compose up -d --force-recreate app`

Si la key se filtra (con `auth_header` viaja por URL: historial del browser, logs), rotarla en
Infisical y reiniciar.

## 5. Alternativas descartadas (y por qué)

| Camino | Por qué no |
|---|---|
| Licencia EE | Camino oficial para SSO de terceros en prod, pero con costo no justificado para un proyecto personal |
| `CompositeAuth` (SimpleAuth + Google) | Pasa el gate técnicamente, pero "destraba" el SSO de terceros en prod sin licencia — el gris de licensing que queremos evitar |
| `MASTRA_DEV=true` en prod | Esquiva el gate de licencia — violación directa del licenciamiento EE |
| SSH tunnel | El puerto 4111 no está expuesto al host de la VM (solo a la red de docker-compose) |
| Bearer de Google + `auth_header` | El token era aceptado por la API, pero capabilities no resolvía el user por el gate EE — Studio inutilizable |

## 6. Referencias

- Doc oficial embebida: `node_modules/@mastra/core/dist/docs/references/docs-studio-auth.md`
  (quickstart con SimpleAuth y sección "EE licensing")
- SimpleAuth: `node_modules/@mastra/core/dist/docs/references/docs-server-auth-simple-auth.md`
- Gate de licencia: `buildCapabilities()` e `isSimpleAuth()` en `@mastra/core` (`dist/chunk-*.js`)
