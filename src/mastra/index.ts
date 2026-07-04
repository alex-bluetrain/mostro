import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { diapersWorkflow } from './workflows/diapers-workflow';
import { weatherAgent } from './agents/weather-agent';
import { diapersAgent } from './agents/diapers-agent';
import { mostroSupervisor } from './agents/mostro-supervisor';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { startNgrokTunnel } from './ngrok';
import { webhookDiapersRoute } from './routes/webhook-diapers.route';

const port = Number(process.env.PORT ?? 4111);
const ngrokOrigin = process.env.NGROK_DOMAIN ? `https://${process.env.NGROK_DOMAIN}` : undefined;

await startNgrokTunnel(port);

export const mastra = new Mastra({
    server: {
        apiRoutes: [
            webhookDiapersRoute,
        ],
        cors: ngrokOrigin
            ? {
                origin: ngrokOrigin,
                credentials: true,
            }
            : undefined,
    },
    workflows: { weatherWorkflow, diapersWorkflow },
    agents: { weatherAgent, diapersAgent, mostroSupervisor },
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
