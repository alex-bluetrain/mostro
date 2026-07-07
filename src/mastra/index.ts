import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherAgent } from './agents/weather-agent';
import { diapersAgent } from './agents/diapers-agent';
import { medsAgent } from './agents/meds-agent';
import { refundsAgent } from './agents/refunds-agent';
import { mostroSupervisor } from './agents/mostro-supervisor';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { startNgrokTunnel } from './ngrok';
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

await startNgrokTunnel(port);

export const mastra = new Mastra({
    server: {
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
        default: new LibSQLStore({
            id: "mastra-storage",
            url: "file:./mastra.db",
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
                    new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
                ],
                spanOutputProcessors: [
                    new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
                ],
            },
        },
    }),
});
