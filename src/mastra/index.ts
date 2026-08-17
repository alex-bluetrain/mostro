import { Mastra } from '@mastra/core/mastra';
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
import { userRepository } from '@business/repositories';
import { startNgrokTunnel } from './ngrok';
import { createServerAuth } from './lib/server-auth';
import { appLogger } from './lib/app-logger';
import { ensureClassifierSeed } from './lib/classifier-seed';
import { appConfig } from './config/app.config';
import { diapersWorkflow } from './workflows/diapers/diapers.workflow';
import { medsWorkflow } from './workflows/meds/meds.workflow';
import { refundsWorkflow } from './workflows/refunds/refunds.workflow';
import { weatherWorkflow } from './workflows/weather/weather.workflow';
import { diapersPollWorkflow } from './workflows/diapers-poll/diapers-poll.workflow';
import { medsPollWorkflow } from './workflows/meds-poll/meds-poll.workflow';
import { refundsPollWorkflow } from './workflows/refunds-poll/refunds-poll.workflow';
import { inboxClassifierAgent } from './agents/inbox-classifier-agent';

const port = appConfig.PORT;
const ngrokOrigin = appConfig.NGROK_DOMAIN ? `https://${appConfig.NGROK_DOMAIN}` : undefined;

// Connect to MongoDB
await mongoose.connect(appConfig.MONGODB_URI, {
    dbName: appConfig.MONGODB_DB_NAME,
});

// ngrok es solo para dev local: en producción (VM + Caddy) no hay authtoken.
if (appConfig.NGROK_AUTHTOKEN) {
    await startNgrokTunnel(port);
}

// Seed admin user
if (appConfig.ADMIN_EMAIL) {
    await userRepository.ensureAdminSeed(
        appConfig.ADMIN_EMAIL,
        appConfig.ADMIN_NAME ?? 'Admin',
        appConfig.ADMIN_TELEGRAM_ID
    );
} else {
    appLogger.warn('[mastra] ADMIN_EMAIL not set, skipping admin seed');
}

// Las reglas de clasificación son precondición de los polls: si falta el puntero,
// el bootstrap lo publica desde env (o avisa fuerte) acá y no 15 min después en el cron.
await ensureClassifierSeed();

export const mastra = new Mastra({
    server: {
        auth: createServerAuth(),
        cors: ngrokOrigin
            ? {
                origin: ngrokOrigin,
                credentials: true,
            }
            : undefined,
    },
    workflows: {
        weatherWorkflow, diapersWorkflow, medsWorkflow, refundsWorkflow,
        diapersPollWorkflow, medsPollWorkflow, refundsPollWorkflow,
    },
    agents: { weatherAgent, diapersAgent, medsAgent, refundsAgent, mostroSupervisor, inboxClassifier: inboxClassifierAgent },
    scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
    storage: new MastraCompositeStore({
        id: 'composite-storage',
        default: new MongoDBStore({
            id: "mastra-storage",
            uri: appConfig.MONGODB_URI,
            dbName: appConfig.MONGODB_DB_NAME,
        }),
        domains: {
            observability: await new DuckDBStore({ path: appConfig.DUCKDB_PATH }).getStore('observability'),
        }
    }),
    logger: appLogger,
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
    try {
        await supervisorChannels.initialize(mastra);
        supervisorChannels.sdk?.onSlashCommand('/start', createTelegramStartHandler());
        appLogger.info('[telegram-start] /start handler registered');
    } catch (err) {
        appLogger.error('[telegram-start] channel init failed; /start handler not registered', { err });
    }
} else {
    appLogger.warn('[telegram-start] supervisor has no channels; /start handler not registered');
}
