// CLI de diagnóstico: corre un .eml del disco contra el InboxClassifier real de un dominio,
// sin tocar Gmail ni reanudar ningún workflow. Uso:
//   pnpm classify:eml -- --domain <diapers|meds|refunds> [--json] <ruta-al-.eml>
import { parseArgs } from 'node:util'
import { Mastra } from '@mastra/core/mastra'
import {
    InboxClassifier,
    FAILED_LABEL,
    type GmailClient,
    type InboxClassifierConfig,
    type HandleContext,
    type HandleResult,
} from '@lib/inbox-classifier/inbox-classifier'
import { inboxClassifierAgent } from '@agents/inbox-classifier-agent'
import { diapersInboxClassifierConfig } from '@workflows/diapers-poll/diapers-inbox-classifier.config'
import { medsInboxClassifierConfig } from '@workflows/meds-poll/meds-inbox-classifier.config'
import { refundsInboxClassifierConfig } from '@workflows/refunds-poll/refunds-inbox-classifier.config'
import { emlToGmailMessage, type GmailMessage } from '../tests/fixtures/eml-to-gmail-message'

const DOMAIN_CONFIGS = {
    diapers: diapersInboxClassifierConfig,
    meds: medsInboxClassifierConfig,
    refunds: refundsInboxClassifierConfig,
} satisfies Record<string, InboxClassifierConfig>

type Domain = keyof typeof DOMAIN_CONFIGS

function printUsage(): void {
    console.error('Uso: pnpm classify:eml -- --domain <diapers|meds|refunds> [--json] <ruta-al-.eml>')
}

function parseCliArgs(): { emlPath: string; domain: Domain; json: boolean } {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: {
            domain: { type: 'string' },
            json: { type: 'boolean', default: false },
        },
        allowPositionals: true,
    })

    const emlPath = positionals[0]
    const domain = values.domain

    if (!emlPath || !domain || !(domain in DOMAIN_CONFIGS)) {
        printUsage()
        process.exit(1)
    }

    return { emlPath, domain: domain as Domain, json: Boolean(values.json) }
}

function buildFakeGmail(message: GmailMessage) {
    let query: string | undefined
    let appliedLabel: string | undefined

    const gmail = {
        users: {
            messages: {
                list: async (params: { q?: string }) => {
                    query = params.q
                    return { data: { messages: [{ id: message.id }] } }
                },
                get: async () => ({ data: message }),
                modify: async () => ({ data: {} }),
            },
            labels: {
                // Vacío a propósito: así cualquier label termina pasando por labels.create,
                // que es lo único que necesitamos observar para saber qué se hubiera aplicado.
                list: async () => ({ data: { labels: [] } }),
                create: async (params: { requestBody?: { name?: string } }) => {
                    appliedLabel = params.requestBody?.name
                    return { data: { id: 'fake-label-id' } }
                },
            },
        },
    }

    return {
        gmail: gmail as unknown as GmailClient,
        getQuery: () => query,
        getAppliedLabel: () => appliedLabel,
    }
}

type SpyResult = { outcomeLabel: string; yearMonth: string; data: unknown; hadHandler: boolean; hadExtraction: boolean }

// Envuelve cada outcome con un espía que reemplaza el handle real: nunca toca un workflow,
// pero captura lo que el handler real hubiera recibido (año-mes resuelto + datos extraídos).
// Se agrega el espía también a los outcomes sin handle (catch-all): un handler que devuelve
// ok:true equivale a no tener handler, así que no cambia el resultado ni el label aplicado.
function wrapConfigForDryRun(config: InboxClassifierConfig, capture: { result?: SpyResult }): InboxClassifierConfig {
    return {
        ...config,
        outcomes: config.outcomes.map(outcome => ({
            ...outcome,
            handle: async (ctx: HandleContext): Promise<HandleResult> => {
                capture.result = {
                    outcomeLabel: outcome.label,
                    yearMonth: ctx.yearMonth,
                    data: ctx.data,
                    hadHandler: Boolean(outcome.handle),
                    hadExtraction: Boolean(outcome.extraction),
                }
                return { ok: true }
            },
        })),
    }
}

async function main(): Promise<void> {
    const { emlPath, domain, json } = parseCliArgs()
    const config = DOMAIN_CONFIGS[domain]

    const message = await emlToGmailMessage(emlPath)
    const hasXReceived = (message.payload.headers ?? []).some(h => h.name.toLowerCase() === 'x-received')
    const fake = buildFakeGmail(message)

    const capture: { result?: SpyResult } = {}
    const wrappedConfig = wrapConfigForDryRun(config, capture)

    // Mastra mínimo: solo el agente que el classifier necesita. Sin storage, sin workflows,
    // sin Mongo — por eso los handle() reales están reemplazados por el espía de arriba.
    const mastra = new Mastra({ agents: { inboxClassifier: inboxClassifierAgent } })
    const classifier = new InboxClassifier(wrappedConfig, fake.gmail)

    await classifier.init(mastra)
    await classifier.run()

    const appliedLabel = fake.getAppliedLabel()

    const report = {
        dryRun: true as const,
        archivo: emlPath,
        dominio: domain,
        query: fake.getQuery(),
        labelAplicado: appliedLabel,
        outcomeClasificado: capture.result?.outcomeLabel ?? null,
        yearMonth: capture.result?.yearMonth ?? null,
        yearMonthOrigen: hasXReceived ? 'header X-Received' : 'fallback (sin X-Received en el mail)',
        outcomeExtrae: capture.result?.hadExtraction ?? false,
        datosExtraidos: capture.result?.data ?? null,
        handlerReal: capture.result?.hadHandler ? capture.result.outcomeLabel : null,
    }

    if (json) {
        console.log(JSON.stringify(report, null, 2))
    } else {
        console.log('=== DRY-RUN: no se leyó ni se escribió nada en Gmail, no se reanudó ningún workflow ===')
        console.log(`Archivo:          ${report.archivo}`)
        console.log(`Dominio:          ${report.dominio}`)
        console.log(`Query usada:      ${report.query}`)
        console.log(`Label aplicado:   ${report.labelAplicado}`)
        console.log(`Año-mes resuelto: ${report.yearMonth ?? '(no llegó a resolverse)'} — ${report.yearMonthOrigen}`)
        console.log(
            `Datos extraídos:  ${report.outcomeExtrae
                ? JSON.stringify(report.datosExtraidos)
                : 'este outcome no define extracción'
            }`,
        )
        console.log(`Handler real:     ${report.handlerReal ? `se hubiera invocado el de "${report.handlerReal}"` : 'catch-all: solo etiqueta'}`)
    }

    process.exit(appliedLabel === FAILED_LABEL ? 1 : 0)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
