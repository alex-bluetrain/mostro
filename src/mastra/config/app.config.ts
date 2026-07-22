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
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_REDIRECT_URI: z.string().min(1).optional(),
    GOOGLE_COOKIE_PASSWORD: z.string().min(32).optional(),
    COMPOSIO_API_KEY: z.string().min(1).optional(),
    COMPOSIO_USER_ID: z.string().min(1).default('default'),
    NGROK_AUTHTOKEN: z.string().min(1).optional(),
    NGROK_DOMAIN: z.string().min(1).optional(),
    DIAPERS_MESSAGING_URL: z.string().min(1).optional(),
    MEDS_MESSAGING_URL: z.string().min(1).optional(),
    REFUNDS_MESSAGING_URL: z.string().min(1).optional(),
    PORT: z.coerce.number().default(4111),
});

export const appConfig = envSchema.parse(process.env);
