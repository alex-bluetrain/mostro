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

// Un año completo: 2025-08 → 2026-07 (el mes actual, 2026-08, tiene el pedido
// real y no se toca). La mayoría completos, con algunos estados intermedios.
const ADDRESS = 'Calle Falsa 123'

const diapersScenarios: DiapersScenario[] = [
    { year: 2025, month: 8, size: 'M', requestedBy: 'Ana', confirm: { deliveryDate: '2025-08-11', deliveryAddress: ADDRESS, quantity: 60 } },
    { year: 2025, month: 9, size: 'M', requestedBy: 'Alex', confirm: { deliveryDate: '2025-09-09', deliveryAddress: ADDRESS, quantity: 60 } },
    { year: 2025, month: 10, size: 'M', requestedBy: 'Ana', confirm: { deliveryDate: '2025-10-14', deliveryAddress: ADDRESS, quantity: 70 } },
    { year: 2025, month: 11, size: 'G', requestedBy: 'Ana', confirm: { deliveryDate: '2025-11-12', deliveryAddress: ADDRESS, quantity: 70 } },
    { year: 2025, month: 12, size: 'G', requestedBy: 'Alex', confirm: { deliveryDate: '2025-12-10', deliveryAddress: ADDRESS, quantity: 90 } },
    { year: 2026, month: 1, size: 'G', requestedBy: 'Ana', confirm: { deliveryDate: '2026-01-13', deliveryAddress: ADDRESS, quantity: 80 } },
    { year: 2026, month: 2, size: 'G', requestedBy: 'Alex', confirm: { deliveryDate: '2026-02-11', deliveryAddress: ADDRESS, quantity: 80 } },
    { year: 2026, month: 3, size: 'G', requestedBy: 'Ana', confirm: { deliveryDate: '2026-03-12', deliveryAddress: ADDRESS, quantity: 100 } },
    { year: 2026, month: 4, size: 'XG', requestedBy: 'Alex', confirm: { deliveryDate: '2026-04-14', deliveryAddress: ADDRESS, quantity: 90 } },
    // Suspendido esperando al proveedor (diapers_requested)
    { year: 2026, month: 5, size: 'M', requestedBy: 'Ana' },
    // Completo: confirmado + notificado (diapers_notification_sent)
    { year: 2026, month: 6, size: 'G', requestedBy: 'Alex', confirm: { deliveryDate: '2026-06-12', deliveryAddress: ADDRESS, quantity: 80 } },
    { year: 2026, month: 7, size: 'XG', requestedBy: 'Ana', confirm: { deliveryDate: '2026-07-15', deliveryAddress: ADDRESS, quantity: 110 } },
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
    { year: 2025, month: 8, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2025-08-08', deliveryAddress: ADDRESS } },
    { year: 2025, month: 9, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2025-09-10', deliveryAddress: ADDRESS } },
    { year: 2025, month: 10, medications: ['Enalapril 10', 'Omeprazol 20'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2025-10-09', deliveryAddress: ADDRESS } },
    { year: 2025, month: 11, medications: ['Enalapril 10', 'Omeprazol 20'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2025-11-11', deliveryAddress: ADDRESS } },
    { year: 2025, month: 12, medications: ['Enalapril 10', 'Ibuprofeno 600'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2025-12-11', deliveryAddress: ADDRESS } },
    { year: 2026, month: 1, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2026-01-09', deliveryAddress: ADDRESS } },
    { year: 2026, month: 2, medications: ['Enalapril 10', 'Aspirina 100'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2026-02-10', deliveryAddress: ADDRESS } },
    { year: 2026, month: 3, medications: ['Enalapril 10', 'Levotiroxina 50'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2026-03-11', deliveryAddress: ADDRESS } },
    { year: 2026, month: 4, medications: ['Enalapril 10', 'Levotiroxina 50'], requestedBy: 'Alex', ack: true, confirm: { deliveryDate: '2026-04-09', deliveryAddress: ADDRESS } },
    // Suspendido esperando acuse (meds_requested)
    { year: 2026, month: 5, medications: ['Ibuprofeno 600'], requestedBy: 'Ana' },
    // Acusado, esperando confirmación de entrega (ack_notified)
    { year: 2026, month: 6, medications: ['Amoxicilina 500'], requestedBy: 'Alex', ack: true },
    // Completo (meds_notification_sent)
    { year: 2026, month: 7, medications: ['Paracetamol 1g'], requestedBy: 'Ana', ack: true, confirm: { deliveryDate: '2026-07-10', deliveryAddress: ADDRESS } },
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
    { year: 2025, month: 8, amount: 12000, reason: 'Consulta médica', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2025-0801' }, deposit: { depositAmount: 12000, depositDate: '2025-08-22' } },
    { year: 2025, month: 9, amount: 8500, reason: 'Farmacia', requestedBy: 'Alex', ack: true, confirm: { refundReference: 'REF-2025-0901' }, deposit: { depositAmount: 8500, depositDate: '2025-09-19' } },
    { year: 2025, month: 10, amount: 25000, reason: 'Estudios de laboratorio', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2025-1001' }, deposit: { depositAmount: 25000, depositDate: '2025-10-24' } },
    { year: 2025, month: 11, amount: 14000, reason: 'Sesión de kinesiología', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2025-1101' }, deposit: { depositAmount: 14000, depositDate: '2025-11-21' } },
    { year: 2025, month: 12, amount: 32000, reason: 'Consulta con especialista', requestedBy: 'Alex', ack: true, confirm: { refundReference: 'REF-2025-1201' }, deposit: { depositAmount: 32000, depositDate: '2025-12-23' } },
    { year: 2026, month: 1, amount: 9500, reason: 'Farmacia', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2026-0101' }, deposit: { depositAmount: 9500, depositDate: '2026-01-23' } },
    { year: 2026, month: 2, amount: 21000, reason: 'Estudios de imagen', requestedBy: 'Alex', ack: true, confirm: { refundReference: 'REF-2026-0201' }, deposit: { depositAmount: 21000, depositDate: '2026-02-20' } },
    { year: 2026, month: 3, amount: 16500, reason: 'Consulta médica', requestedBy: 'Ana', ack: true, confirm: { refundReference: 'REF-2026-0301' }, deposit: { depositAmount: 16500, depositDate: '2026-03-20' } },
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

// ── Reloj simulado ──────────────────────────────────────────────────────────
// Los steps toman timestamps con nowUnix() (que usa Date.now), así que cada
// paso se corre con Date.now apuntando al momento simulado: la solicitud cae
// entre el 1 y el 5 del mes y los pasos siguientes días después, como en la
// realidad. Pseudo-random determinista por run: re-correr el seed da las
// mismas fechas.

const DAY = 86_400

const realDateNow = Date.now.bind(Date)

async function atTime<T>(unixSeconds: number, fn: () => Promise<T>): Promise<T> {
    Date.now = () => unixSeconds * 1000
    try {
        return await fn()
    } finally {
        Date.now = realDateNow
    }
}

// mulberry32: seeds consecutivos (mes a mes) dan salidas bien mezcladas,
// a diferencia de un LCG simple donde el primer valor queda correlacionado.
function seededRandom(seed: number): () => number {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = seed
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

type Timeline = { requestedAt: number; ackAt: number; confirmAt: number; depositAt: number }

function buildTimeline(domain: Domain, year: number, month: number): Timeline {
    const rand = seededRandom(year * 1000 + month * 10 + DOMAINS.indexOf(domain))
    const day = 1 + Math.floor(rand() * 5) // 1..5
    const hour = 9 + Math.floor(rand() * 9) // 9..17
    const requestedAt = Math.floor(Date.UTC(year, month - 1, day, hour, Math.floor(rand() * 60)) / 1000)
    const ackAt = requestedAt + Math.floor((1 + rand() * 2) * DAY) // +1-3 días
    const confirmAt = ackAt + Math.floor((2 + rand() * 3) * DAY) // +2-5 días
    const depositAt = confirmAt + Math.floor((7 + rand() * 8) * DAY) // +7-15 días
    return { requestedAt, ackAt, confirmAt, depositAt }
}

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
        const t = buildTimeline('diapers', s.year, s.month)
        const started = await atTime(t.requestedAt, () => startDiapers(mastra, {
            size: s.size, year: s.year, month: s.month, requestedBy: s.requestedBy,
        }))
        if (!reportStart(label, started)) continue

        if (s.confirm) {
            const confirmed = await atTime(t.confirmAt, () =>
                confirmDiapersDate(mastra, { ...s.confirm!, year: s.year, month: s.month }))
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
        const t = buildTimeline('meds', s.year, s.month)
        const started = await atTime(t.requestedAt, () => startMedsOrder(mastra, {
            medications: s.medications, year: s.year, month: s.month, requestedBy: s.requestedBy,
        }))
        if (!reportStart(label, started)) continue

        if (s.ack) {
            const acked = await atTime(t.ackAt, () => acknowledgeMedsOrder(mastra, s.year, s.month))
            if (!reportStep(label, 'ack', acked)) continue
        }
        if (s.confirm) {
            const confirmed = await atTime(t.confirmAt, () =>
                confirmMedsDelivery(mastra, { ...s.confirm!, year: s.year, month: s.month }))
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
        const t = buildTimeline('refunds', s.year, s.month)
        const started = await atTime(t.requestedAt, () => startRefundRequest(mastra, {
            amount: s.amount, reason: s.reason, year: s.year, month: s.month, requestedBy: s.requestedBy,
        }))
        if (!reportStart(label, started)) continue

        if (s.ack) {
            const acked = await atTime(t.ackAt, () => acknowledgeRefund(mastra, s.year, s.month))
            if (!reportStep(label, 'ack', acked)) continue
        }
        if (s.confirm) {
            const confirmed = await atTime(t.confirmAt, () =>
                confirmRefund(mastra, { ...s.confirm!, year: s.year, month: s.month }))
            if (!reportStep(label, 'confirm', confirmed)) continue
        }
        if (s.deposit) {
            const deposited = await atTime(t.depositAt, () =>
                receiveDeposit(mastra, { ...s.deposit!, year: s.year, month: s.month }))
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
