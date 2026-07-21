import z from "zod";

const envSchema = z.object({
    MONGODB_URI: z.string().min(2),
    MONGODB_DB_NAME: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
    TELEGRAM_BOT_USERNAME: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
    NGROK_AUTHTOKEN: z.string().min(1).optional(),
    NGROK_DOMAIN: z.string().min(1).optional(),
    DIAPERS_MESSAGING_URL: z.string().min(1).optional(),
    MEDS_MESSAGING_URL: z.string().min(1).optional(),
    REFUNDS_MESSAGING_URL: z.string().min(1).optional(),
    PORT: z.coerce.number().default(4111),
});

export const appConfig = envSchema.parse(process.env);
