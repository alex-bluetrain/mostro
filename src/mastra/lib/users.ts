import type { Collection } from 'mongodb'
import { appConfig } from '../config/app.config'
import { getDb } from './mongo-client'
import { nowUnix } from './unix-time'

export type UserRole = 'admin' | 'member'

export type User = {
    telegramId: string
    name: string
    role: UserRole
    addedAt: number
}

async function usersCollection(): Promise<Collection<User>> {
    const db = await getDb()
    return db.collection<User>('users')
}

export function telegramIdFromResourceId(resourceId: string): string | null {
    const match = /^telegram:(.+)$/.exec(resourceId)
    return match ? match[1] : null
}

export async function getUserByTelegramId(telegramId: string): Promise<User | null> {
    const col = await usersCollection()
    return col.findOne({ telegramId }, { projection: { _id: 0 } })
}

export async function getUserByResourceId(resourceId: string): Promise<User | null> {
    const telegramId = telegramIdFromResourceId(resourceId)
    if (!telegramId) return null
    return getUserByTelegramId(telegramId)
}

// Upsert por telegramId: si ya existe, no pisa nada ($setOnInsert)
export async function createUser(user: User): Promise<void> {
    const col = await usersCollection()
    await col.updateOne(
        { telegramId: user.telegramId },
        { $setOnInsert: user },
        { upsert: true },
    )
}

export async function setUserName(telegramId: string, name: string): Promise<boolean> {
    const col = await usersCollection()
    const result = await col.updateOne({ telegramId }, { $set: { name } })
    return result.matchedCount > 0
}

export async function ensureAdminSeed(): Promise<void> {
    const adminId = appConfig.ADMIN_TELEGRAM_ID
    if (!adminId) {
        console.warn('[users] ADMIN_TELEGRAM_ID not set, skipping admin seed')
        return
    }
    await createUser({
        telegramId: adminId,
        name: appConfig.ADMIN_NAME ?? 'Admin',
        role: 'admin',
        addedAt: nowUnix(),
    })
}
