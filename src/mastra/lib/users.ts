import type { Collection } from 'mongodb'
import { appConfig } from '../config/app.config'
import { getDb } from './mongo-client'
import { subAgentKeys } from './sub-agent-keys'
import { nowUnix } from './unix-time'

export type UserRole = 'admin' | 'member'

// Identidad canónica: email de Google (lowercase). telegramId es una identidad
// vinculada, se setea al canjear un invite (o por seed para el admin).
export type User = {
    email: string
    name: string
    role: UserRole
    telegramId?: string
    addedAt: number
}

export type ParsedResourceId =
    | { kind: 'telegram'; telegramId: string }
    | { kind: 'email'; email: string }

async function usersCollection(): Promise<Collection<User>> {
    const db = await getDb()
    return db.collection<User>('users')
}

// La delegación a sub-agentes deriva el resourceId hijo como
// `${resourceId}-${agentName}` (ej. 'ana@gmail.com-diapersAgent');
// se recorta ese sufijo para resolver siempre a la identidad del padre.
// Solo se recortan keys registradas: un sufijo desconocido no matchea ningún
// user y el error queda visible en vez de mangled en silencio.
function stripSubAgentSuffix(resourceId: string): string {
    for (const key of subAgentKeys) {
        const suffix = `-${key}`
        if (resourceId.endsWith(suffix)) return resourceId.slice(0, -suffix.length)
    }
    return resourceId
}

// Un resourceId puede ser 'telegram:<id>' (threads legacy / default de channels)
// o un email plano (canónico: threads nuevos y futura web)
export function parseResourceId(resourceId: string): ParsedResourceId | null {
    const base = stripSubAgentSuffix(resourceId)
    const telegramMatch = /^telegram:(.+)$/.exec(base)
    if (telegramMatch) return { kind: 'telegram', telegramId: telegramMatch[1] }
    if (base.includes('@')) return { kind: 'email', email: base.trim().toLowerCase() }
    return null
}

export async function getUserByEmail(email: string): Promise<User | null> {
    const col = await usersCollection()
    return col.findOne({ email: email.toLowerCase() }, { projection: { _id: 0 } })
}

export async function getUserByTelegramId(telegramId: string): Promise<User | null> {
    const col = await usersCollection()
    return col.findOne({ telegramId }, { projection: { _id: 0 } })
}

export async function getUserByResourceId(resourceId: string): Promise<User | null> {
    const parsed = parseResourceId(resourceId)
    if (!parsed) return null
    return parsed.kind === 'telegram'
        ? getUserByTelegramId(parsed.telegramId)
        : getUserByEmail(parsed.email)
}

// Upsert por email: crea si no existe, no pisa name/role de un user existente
export async function upsertUser(user: Omit<User, 'telegramId'>): Promise<void> {
    const email = user.email.toLowerCase()
    const col = await usersCollection()
    await col.updateOne(
        { email },
        { $setOnInsert: { ...user, email } },
        { upsert: true },
    )
}

// Vincula (o re-vincula, ej. cambio de teléfono) el Telegram de un user existente
export async function linkTelegramId(email: string, telegramId: string): Promise<boolean> {
    const col = await usersCollection()
    const result = await col.updateOne({ email: email.toLowerCase() }, { $set: { telegramId } })
    return result.matchedCount > 0
}

export async function setUserNameByResourceId(resourceId: string, name: string): Promise<boolean> {
    const parsed = parseResourceId(resourceId)
    if (!parsed) return false
    const filter = parsed.kind === 'telegram'
        ? { telegramId: parsed.telegramId }
        : { email: parsed.email }
    const col = await usersCollection()
    const result = await col.updateOne(filter, { $set: { name } })
    return result.matchedCount > 0
}

export async function ensureAdminSeed(): Promise<void> {
    const col = await usersCollection()
    // Índices de integridad: un telegram no puede pertenecer a dos usuarios;
    // sparse porque telegramId es opcional
    await col.createIndex({ email: 1 }, { unique: true })
    await col.createIndex({ telegramId: 1 }, { unique: true, sparse: true })

    const adminEmail = appConfig.ADMIN_EMAIL
    if (!adminEmail) {
        console.warn('[users] ADMIN_EMAIL not set, skipping admin seed')
        return
    }
    const email = adminEmail.toLowerCase()
    await col.updateOne(
        { email },
        {
            $setOnInsert: {
                email,
                name: appConfig.ADMIN_NAME ?? 'Admin',
                role: 'admin' as const,
                addedAt: nowUnix(),
            },
            // El vínculo de Telegram sí se re-aplica en cada boot (idempotente)
            ...(appConfig.ADMIN_TELEGRAM_ID ? { $set: { telegramId: appConfig.ADMIN_TELEGRAM_ID } } : {}),
        },
        { upsert: true },
    )
}
