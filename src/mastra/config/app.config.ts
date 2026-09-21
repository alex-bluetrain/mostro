import z from "zod";

// Normaliza valores "presentes pero vacíos" a undefined. Cubre el caso de
// docker-compose env_file, que no saca las comillas: `FOO=''` -> `''`.
function emptyToUndefined(value: string): string | undefined {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    return trimmed.length === 0 ? undefined : trimmed;
}

const envSchema = z.object({
    MONGODB_URI: z.string().min(2),
    MONGODB_DB_NAME: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    TELEGRAM_BOT_USERNAME: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
    // Canal secundario opcional. Las tres van juntas o no va ninguna: el
    // adapter lanza en el constructor si le falta alguna, así que sin las tres
    // ni se registra (ver mostro-supervisor.ts).
    DISCORD_BOT_TOKEN: z.string().min(1).optional(),
    DISCORD_APPLICATION_ID: z.string().min(1).optional(),
    DISCORD_PUBLIC_KEY: z.string().min(1).optional(),
    ADMIN_TELEGRAM_ID: z.string().min(1).optional(),
    ADMIN_NAME: z.string().min(1).optional(),
    ADMIN_EMAIL: z.string().min(3).optional(),
    // Secreto compartido con el BFF de mostro-web, que firma un JWT por request
    // con el email verificado por Google. Es el trust anchor entre los dos.
    MOSTRO_JWT_SECRET: z.string().min(32).optional(),
    // Habilita SimpleAuth para Studio (ademas del JWT del BFF). Pensada para
    // prod: permite apuntar Studio local contra prod con un token de admin.
    STUDIO_API_KEY: z.string().min(32).optional(),
    // Habilita MastraAuthGoogle en modo Bearer: clientes (Expo Android/web con
    // PKCE) mandan el id_token de Google en el header Authorization y mostro lo
    // verifica contra JWKS. Opt-in como STUDIO_API_KEY; sin esto el provider ni
    // se registra. GOOGLE_CLIENT_SECRET + GOOGLE_COOKIE_PASSWORD son solo para
    // la fase 2 (SSO/cookie), que este plan no activa.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_COOKIE_PASSWORD: z.string().min(32).optional(),
    // Templates JSON de reglas de clasificación (minificados). Solo se usan como
    // bootstrap: si el dominio ya tiene puntero activo en Mongo, se ignoran.
    CLASSIFIER_RULES_DIAPERS: z.string().optional(),
    CLASSIFIER_RULES_MEDS: z.string().optional(),
    CLASSIFIER_RULES_REFUNDS: z.string().optional(),
    // Logs a Axiom. Si falta alguna de las dos, los logs quedan solo en stdout
    // (dev) / docker logs (prod). Mismo criterio opt-in que STUDIO_API_KEY.
    AXIOM_TOKEN: z.string().optional(),
    AXIOM_DATASET: z.string().optional(),
    GMAIL_MAILER_CLIENT_ID: z.string().min(1),
    GMAIL_MAILER_CLIENT_SECRET: z.string().min(1),
    GMAIL_MAILER_REFRESH_TOKEN: z.string().min(1),
    GMAIL_MAILER_SENDER: z.string().min(3),
    PATIENT_NAME: z.string().min(1),
    DELIVERY_ADDRESS: z.string().min(1),
    REQUESTER_NAME: z.string().min(1),
    REQUESTER_PHONE: z.string().min(1),
    DIAPERS_EMAIL_TO: z.string().min(3),
    MEDS_EMAIL_TO: z.string().min(3),
    REFUNDS_EMAIL_TO: z.string().min(3),
    // Docker Compose no interpreta comillas en env_file: `NGROK_AUTHTOKEN=''`
    // llega como el string literal `''` (truthy) y dispara ngrok con un token
    // inválido. Normalizamos a undefined cualquier valor vacío/whitespace/comillas.
    NGROK_AUTHTOKEN: z.string().transform(emptyToUndefined).optional(),
    NGROK_DOMAIN: z.string().transform(emptyToUndefined).optional(),
    // A dónde apunta el túnel. El login (SSO de Google) lo maneja mostro-web, así
    // que el túnel expone la webapp, no el backend. En Docker es `mostro-web:3000`
    // por el hostname de compose; en dev local sería `localhost:3000`.
    NGROK_FORWARD_ADDR: z.string().transform(emptyToUndefined).optional(),
    // Orígenes CORS extra para dev local, separados por coma. El backend ya
    // permite el dominio de ngrok; esto habilita, por ejemplo, la Expo web en
    // http://localhost:8097 sin tocar código. Vacío en prod.
    DEV_CORS_ORIGINS: z
        .string()
        .transform(emptyToUndefined)
        .optional()
        .transform((value) =>
            value
                ? value
                    .split(',')
                    .map((origin) => origin.trim())
                    .filter((origin) => origin.length > 0)
                : []
        ),
    PORT: z.coerce.number().default(4111),
    DUCKDB_PATH: z.string().min(1).default('mastra.duckdb'),
});

export const appConfig = envSchema.parse(process.env);
