import { randomBytes } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getDb } from './mongo-client'
import { nowUnix } from './unix-time'

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60

export type Invite = {
    code: string
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

export async function createInvite(createdBy: string): Promise<Invite> {
    const now = nowUnix()
    const invite: Invite = {
        code: generateInviteCode(),
        createdBy,
        createdAt: now,
        expiresAt: now + INVITE_TTL_SECONDS,
    }
    const col = await invitesCollection()
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
