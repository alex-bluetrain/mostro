// Genera runs de diapers/meds/refunds en meses pasados usando el engine real de
// workflows, para testear la reportería web sin pasar por el ciclo de mails.
// No inserta snapshots a mano: corre start + resumes de los helpers *-run.ts,
// dejando cada run en el estado intermedio que pida el escenario.
//
// El mailer corre en dry-run (MAILER_DRY_RUN) y no hay agentes registrados:
// los notify steps avanzan el estado con sent = 0.
//
// Uso: pnpm seed:runs                       (los 3 dominios)
//      pnpm seed:runs -- --domain diapers   (uno solo)

import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { Mastra } from '@mastra/core/mastra'
import { createWorkflowStateReader } from '@mastra/core/workflows'
import { MongoDBStore } from '@mastra/mongodb'
import { appConfig } from '@config/app.config'
import { diapersWorkflow } from '@workflows/diapers/diapers.workflow'
import { medsWorkflow } from '@workflows/meds/meds.workflow'
import { refundsWorkflow } from '@workflows/refunds/refunds.workflow'
import { getDiapersRunId } from '@workflows/diapers/utils/diapers.utils'
import { getMedsRunId } from '@workflows/meds/utils/meds.utils'
import { getRefundsRunId } from '@workflows/refunds/utils/refunds.utils'
import { startDiapers, confirmDiapersDate } from '@lib/diapers-run'
import { startMedsOrder, acknowledgeMedsOrder, confirmMedsDelivery } from '@lib/meds-run'
import { startRefundRequest, acknowledgeRefund, confirmRefund, receiveDeposit } from '@lib/refunds-run'

// El check es en tiempo de ejecución de sendEmail(), así que setearlo acá
// (después de los imports hoisteados) llega antes de que corra cualquier workflow.
process.env.MAILER_DRY_RUN = 'true'

const DOMAINS = ['diapers', 'meds', 'refunds'] as const
type Domain = (typeof DOMAINS)[number]

// ── Escenarios (editables) ──────────────────────────────────────────────────
// Datos siempre ficticios: el repo es público.

type DiapersScenario = {
    year: number
    month: number
    size: 'M' | 'G' | 'XG'
    requestedBy: string
    confirm?: { deliveryDate: string; deliveryAddress: string; quantity: number }
}

const diapersScenarios: DiapersScenario[] = [
    // Suspendido esperando al proveedor (diapers_requested)
    { year: 2026, month: 5, size: 'M', requestedBy: 'Ana' },
    // Completo: confirmado + notificado (diapers_notification_sent)
    {
        year: 2026, month: 6, size: 'G', requestedBy: 'Alex',
        confirm: { deliveryDate: '2026-06-12', deliveryAddress: 'Calle Falsa 123', quantity: 80 },
    },
]

type MedsScenario = {
    year: number
    month: number
    medications: string[]
    requestedBy: string
    ack?: true
    confirm?: { deliveryDate: string; deliveryAddress: string }
}

const medsScenarios: MedsScenario[] = [
    // Suspendido esperando acuse (meds_requested)
    { year: 2026, month: 5, medications: ['Ibuprofeno 600'], requestedBy: 'Ana' },
    // Acusado, esperando confirmación de entrega (ack_notified)
    { year: 2026, month: 6, medications: ['Amoxicilina 500'], requestedBy: 'Alex', ack: true },
    // Completo (meds_notification_sent)
    {
        year: 2026, month: 7, medications: ['Paracetamol 1g'], requestedBy: 'Ana', ack: true,
        confirm: { deliveryDate: '2026-07-10', deliveryAddress: 'Calle Falsa 123' },
    },
]

type RefundsScenario = {
    year: number
    month: number
    amount: number
    requestedBy: string
    reason?: string
    ack?: true
    confirm?: { refundReference: string }
    deposit?: { depositAmount: number; depositDate: string }
}

// `reason` siempre presente: si falta, Mongo persiste null y el state schema
// (`reason: z.string().optional()`) rechaza el estado al validar el resume.
const refundsScenarios: RefundsScenario[] = [
    // Suspendido esperando acuse (refund_requested)
    { year: 2026, month: 4, amount: 15000, reason: 'Consulta médica', requestedBy: 'Ana' },
    // Acusado (ack_notified)
    { year: 2026, month: 5, amount: 22000, reason: 'Estudios de laboratorio', requestedBy: 'Alex', ack: true },
    // Confirmado, esperando depósito (confirmation_notified)
    {
        year: 2026, month: 6, amount: 18000, reason: 'Sesión de kinesiología', requestedBy: 'Ana', ack: true,
        confirm: { refundReference: 'REF-2026-0601' },
    },
    // Completo (refunds_notification_sent)
    {
        year: 2026, month: 7, amount: 30000, reason: 'Medicamentos', requestedBy: 'Alex', ack: true,
        confirm: { refundReference: 'REF-2026-0702' },
        deposit: { depositAmount: 30000, depositDate: '2026-07-20' },
    },
]

// ── Infra ───────────────────────────────────────────────────────────────────

function fail(message: string): never {
    console.error(`[seed-runs] ${message}`)
    process.exit(1)
}

function parseCliArgs(): { domains: readonly Domain[] } {
    const { values } = parseArgs({ options: { domain: { type: 'string' } } })
    if (!values.domain) return { domains: DOMAINS }
    if (!DOMAINS.includes(values.domain as Domain)) {
        fail(`dominio inválido "${values.domain}": tiene que ser uno de ${DOMAINS.join(', ')}`)
    }
    return { domains: [values.domain as Domain] }
}

function buildMastra(): Mastra {
    const mastra = new Mastra({
        workflows: { diapersWorkflow, medsWorkflow, refundsWorkflow },
        storage: new MongoDBStore({
            id: 'seed-runs-storage',
            uri: appConfig.MONGODB_URI,
            dbName: appConfig.MONGODB_DB_NAME,
        }),
    })

    // Los notify steps hacen `mastra?.getAgent('mostroSupervisor')` con guard
    // `if (supervisor)`, pero getAgent LANZA si el agente no está registrado.
    // Devolver undefined reproduce el camino sin supervisor: el step saltea el
    // envío de Telegram y avanza el estado con sent = 0.
    const originalGetAgent = mastra.getAgent.bind(mastra)
    mastra.getAgent = ((name: string) =>
        name === 'mostroSupervisor' ? undefined : originalGetAgent(name as never)) as typeof mastra.getAgent

    return mastra
}

function monthLabel(domain: Domain, year: number, month: number): string {
    return `${domain} ${year}-${String(month).padStart(2, '0')}`
}

const workflowIdByDomain: Record<Domain, string> = {
    diapers: 'diapersWorkflow',
    meds: 'medsWorkflow',
    refunds: 'refundsWorkflow',
}

// Los helpers de start solo saltean runs suspended/running: un run ya completado
// (success) se re-ejecutaría entero. Este check lo saltea también, para que
// correr el seed dos veces sea un no-op.
async function runAlreadyDone(mastra: Mastra, domain: Domain, runId: string): Promise<boolean> {
    const existing = await mastra.getWorkflow(workflowIdByDomain[domain]).getWorkflowRunById(runId)
    if (!existing) return false
    return createWorkflowStateReader(existing).getStatus() === 'success'
}

type StartResult =
    | { alreadyInProgress: true; status: string }
    | { alreadyInProgress: false; ok: false; reason: string; message?: string }
    | { alreadyInProgress: false; ok: true; result: unknown }

type StepResult = { ok: true; result: unknown } | { ok: false; reason: string }

// Corta el escenario si el start no dejó un run nuevo utilizable.
// alreadyInProgress no es error: correr el seed dos veces es válido.
function reportStart(label: string, started: StartResult): boolean {
    if (started.alreadyInProgress) {
        console.info(`[seed-runs] ${label}: ya en curso (${started.status}), salteado`)
        return false
    }
    if (!started.ok) {
        console.error(`[seed-runs] ${label}: start falló (${started.reason})`)
        return false
    }
    return true
}

function reportStep(label: string, step: string, result: StepResult): boolean {
    if (!result.ok) {
        console.error(`[seed-runs] ${label}: ${step} falló (${result.reason})`)
        return false
    }
    return true
}

// ── Seeds por dominio ───────────────────────────────────────────────────────

async function seedDiapers(mastra: Mastra): Promise<void> {
    for (const s of diapersScenarios) {
        const label = monthLabel('diapers', s.year, s.month)
        if (await runAlreadyDone(mastra, 'diapers', getDiapersRunId(s.year, s.month))) {
            console.info(`[seed-runs] ${label}: ya completado, salteado`)
            continue
        }
        const started = await startDiapers(mastra, {
            size: s.size, year: s.year, month: s.month, requestedBy: s.requestedBy,
        })
        if (!reportStart(label, started)) continue

        if (s.confirm) {
            const confirmed = await confirmDiapersDate(mastra, { ...s.confirm, year: s.year, month: s.month })
            if (!reportStep(label, 'confirm', confirmed)) continue
        }
        console.info(`[seed-runs] ${label}: ok`)
    }
}

async function seedMeds(mastra: Mastra): Promise<void> {
    for (const s of medsScenarios) {
        const label = monthLabel('meds', s.year, s.month)
        if (await runAlreadyDone(mastra, 'meds', getMedsRunId(s.year, s.month))) {
            console.info(`[seed-runs] ${label}: ya completado, salteado`)
            continue
        }
        const started = await startMedsOrder(mastra, {
            medications: s.medications, year: s.year, month: s.month, requestedBy: s.requestedBy,
        })
        if (!reportStart(label, started)) continue

        if (s.ack) {
            const acked = await acknowledgeMedsOrder(mastra, s.year, s.month)
            if (!reportStep(label, 'ack', acked)) continue
        }
        if (s.confirm) {
            const confirmed = await confirmMedsDelivery(mastra, { ...s.confirm, year: s.year, month: s.month })
            if (!reportStep(label, 'confirm', confirmed)) continue
        }
        console.info(`[seed-runs] ${label}: ok`)
    }
}

async function seedRefunds(mastra: Mastra): Promise<void> {
    for (const s of refundsScenarios) {
        const label = monthLabel('refunds', s.year, s.month)
        if (await runAlreadyDone(mastra, 'refunds', getRefundsRunId(s.year, s.month))) {
            console.info(`[seed-runs] ${label}: ya completado, salteado`)
            continue
        }
        const started = await startRefundRequest(mastra, {
            amount: s.amount, reason: s.reason, year: s.year, month: s.month, requestedBy: s.requestedBy,
        })
        if (!reportStart(label, started)) continue

        if (s.ack) {
            const acked = await acknowledgeRefund(mastra, s.year, s.month)
            if (!reportStep(label, 'ack', acked)) continue
        }
        if (s.confirm) {
            const confirmed = await confirmRefund(mastra, { ...s.confirm, year: s.year, month: s.month })
            if (!reportStep(label, 'confirm', confirmed)) continue
        }
        if (s.deposit) {
            const deposited = await receiveDeposit(mastra, { ...s.deposit, year: s.year, month: s.month })
            if (!reportStep(label, 'deposit', deposited)) continue
        }
        console.info(`[seed-runs] ${label}: ok`)
    }
}

const seedByDomain: Record<Domain, (mastra: Mastra) => Promise<void>> = {
    diapers: seedDiapers,
    meds: seedMeds,
    refunds: seedRefunds,
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { domains } = parseCliArgs()

    // Los notify steps consultan los suscriptores por mongoose antes del guard
    // del supervisor, así que la conexión hace falta aunque no se envíe nada.
    await mongoose.connect(appConfig.MONGODB_URI, { dbName: appConfig.MONGODB_DB_NAME })

    const mastra = buildMastra()
    try {
        for (const domain of domains) {
            await seedByDomain[domain](mastra)
        }
    } finally {
        await mongoose.disconnect()
    }

    console.info('[seed-runs] listo')
    // El store de Mastra deja la conexión abierta; el script ya terminó.
    process.exit(0)
}

await main()
