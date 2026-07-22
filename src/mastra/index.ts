import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { MongoDBStore } from '@mastra/mongodb';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherAgent } from './agents/weather-agent';
import { diapersAgent } from './agents/diapers-agent';
import { medsAgent } from './agents/meds-agent';
import { refundsAgent } from './agents/refunds-agent';
import { mostroSupervisor } from './agents/mostro-supervisor';
import { createTelegramStartHandler } from './lib/telegram-start';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import mongoose from 'mongoose';
import { userRepository } from '../business/repositories';
import { startNgrokTunnel } from './ngrok';
import { createGoogleAuth } from './lib/google-auth';
import { webhookDiapersRoute } from './routes/webhook-diapers.route';
import { webhookMedsAckRoute, webhookMedsConfirmRoute } from './routes/webhook-meds.route';
import { webhookRefundsAckRoute, webhookRefundsConfirmationRoute, webhookRefundsDepositRoute } from './routes/webhook-refunds.route';
import { appConfig } from './config/app.config';
import { diapersWorkflow } from './workflows/diapers/diapers.workflow';
import { medsWorkflow } from './workflows/meds/meds.workflow';
import { refundsWorkflow } from './workflows/refunds/refunds.workflow';
import { weatherWorkflow } from './workflows/weather/weather.workflow';

const port = appConfig.PORT;
const ngrokOrigin = appConfig.NGROK_DOMAIN ? `https://${appConfig.NGROK_DOMAIN}` : undefined;

// Connect to MongoDB
await mongoose.connect(appConfig.MONGODB_URI, {
    dbName: appConfig.MONGODB_DB_NAME,
});

await startNgrokTunnel(port);

// Seed admin user
if (appConfig.ADMIN_EMAIL) {
    await userRepository.ensureAdminSeed(
        appConfig.ADMIN_EMAIL,
        appConfig.ADMIN_NAME ?? 'Admin',
        appConfig.ADMIN_TELEGRAM_ID
    );
} else {
    console.warn('[mastra] ADMIN_EMAIL not set, skipping admin seed');
}

export const mastra = new Mastra({
    server: {
        auth: createGoogleAuth(),
        apiRoutes: [
            webhookDiapersRoute,
            webhookMedsAckRoute,
            webhookMedsConfirmRoute,
            webhookRefundsAckRoute,
            webhookRefundsConfirmationRoute,
            webhookRefundsDepositRoute,
        ],
        cors: ngrokOrigin
            ? {
                origin: ngrokOrigin,
                credentials: true,
            }
            : undefined,
    },
    workflows: { weatherWorkflow, diapersWorkflow, medsWorkflow, refundsWorkflow },
    agents: { weatherAgent, diapersAgent, medsAgent, refundsAgent, mostroSupervisor },
    scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
    storage: new MastraCompositeStore({
        id: 'composite-storage',
        default: new MongoDBStore({
            id: "mastra-storage",
            uri: appConfig.MONGODB_URI,
            dbName: appConfig.MONGODB_DB_NAME,
        }),
        domains: {
            observability: await new DuckDBStore().getStore('observability'),
        }
    }),
    logger: new PinoLogger({
        name: 'Mastra',
        level: 'info',
    }),
    observability: new Observability({
        configs: {
            default: {
                serviceName: 'mastra',
                exporters: [
                    new MastraStorageExporter(), // Persists observability events to Mastra Storage
                    // new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
                ],
                spanOutputProcessors: [
                    new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
                ],
            },
        },
    }),
});

// El adapter de telegram desvía los /start (bot_command) al pipeline de slash
// commands del Chat SDK, así que el canje de invitaciones se registra acá y no
// en el gate de onDirectMessage. initialize() es idempotente: espera la
// inicialización que addAgent ya disparó y garantiza que sdk esté disponible.
const supervisorChannels = mostroSupervisor.getChannels();
if (supervisorChannels) {
    await supervisorChannels.initialize(mastra);
    supervisorChannels.sdk?.onSlashCommand('/start', createTelegramStartHandler());
    console.info('[telegram-start] /start handler registered');
} else {
    console.warn('[telegram-start] supervisor has no channels; /start handler not registered');
}
