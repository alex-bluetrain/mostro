import z from "zod";

const envSchema = z.object({
    MONGODB_URI: z.string().min(2),
    MONGODB_DB_NAME: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    TELEGRAM_BOT_USERNAME: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
    ADMIN_TELEGRAM_ID: z.string().min(1).optional(),
    ADMIN_NAME: z.string().min(1).optional(),
    ADMIN_EMAIL: z.string().min(3).optional(),
    GOOGLE_SSO_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_SSO_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_SSO_REDIRECT_URI: z.string().min(1).optional(),
    GOOGLE_SSO_COOKIE_PASSWORD: z.string().min(32).optional(),
    // Si está seteada, el server usa SimpleAuth (exento del gate EE de Studio)
    // en lugar de Google SSO. Pensada para prod: habilita Studio local → prod.
    STUDIO_API_KEY: z.string().min(32).optional(),
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
    NGROK_AUTHTOKEN: z.string().optional(),
    NGROK_DOMAIN: z.string().optional(),
    PORT: z.coerce.number().default(4111),
    DUCKDB_PATH: z.string().min(1).default('mastra.duckdb'),
});

export const appConfig = envSchema.parse(process.env);
