import { randomBytes } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getDb } from './mongo-client'
import { nowUnix } from './unix-time'
import { upsertUser } from './users'

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60

export type Invite = {
    code: string
    email: string
    name?: string
    createdBy: string
    createdAt: number
    expiresAt: number
    usedBy?: string
}

async function invitesCollection(): Promise<Collection<Invite>> {
    const db = await getDb()
    return db.collection<Invite>('invites')
}

export function generateInviteCode(): string {
    return randomBytes(9).toString('base64url')
}

// Crea el invite nominado y asegura que el user destinatario exista (sin
// telegram todavía): desde este momento ya puede loguearse a la web
export async function createInvite(params: { createdBy: string; email: string; name?: string }): Promise<Invite> {
    const email = params.email.trim().toLowerCase()
    const now = nowUnix()
    await upsertUser({ email, name: params.name ?? '', role: 'member', addedAt: now })
    const invite: Invite = {
        code: generateInviteCode(),
        email,
        ...(params.name ? { name: params.name } : {}),
        createdBy: params.createdBy,
        createdAt: now,
        expiresAt: now + INVITE_TTL_SECONDS,
    }
    const col = await invitesCollection()
    // Índice de integridad: un código de invite no puede repetirse (createIndex
    // es idempotente, se recrea en cada invite sin costo relevante)
    await col.createIndex({ code: 1 }, { unique: true })
    await col.insertOne(invite)
    return invite
}

// Canje atómico: matchea solo invites sin usar y vigentes, y los marca usados
// en la misma operación (dos canjes concurrentes: uno gana, el otro recibe null)
export async function redeemInvite(code: string, telegramId: string): Promise<Invite | null> {
    const col = await invitesCollection()
    return col.findOneAndUpdate(
        { code, usedBy: { $exists: false }, expiresAt: { $gt: nowUnix() } },
        { $set: { usedBy: telegramId } },
        { returnDocument: 'after' },
    )
}
