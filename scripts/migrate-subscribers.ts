// Migra la collection `subscribers` a `users.preferences.notifications`.
// Idempotente: correrlo dos veces no cambia nada la segunda vez.
//
// Uso: pnpm migrate:subscribers          (dry run, no escribe)
//      pnpm migrate:subscribers -- --apply

import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { appConfig } from '@config/app.config'
import { User } from '@business/models/user.model'

async function main(): Promise<void> {
    const { values } = parseArgs({ options: { apply: { type: 'boolean' } } })
    const apply = values.apply === true

    await mongoose.connect(appConfig.MONGODB_URI, { dbName: appConfig.MONGODB_DB_NAME })
    try {
        const db = mongoose.connection.db
        if (!db) throw new Error('no database handle after connect')

        const collections = await db.listCollections({ name: 'subscribers' }).toArray()
        if (collections.length === 0) {
            console.info('[migrate-subscribers] no existe la collection `subscribers`: nada que migrar')
            return
        }

        const docs = await db.collection<{ email?: string }>('subscribers').find().toArray()
        const emails = docs
            .map(d => d.email?.toLowerCase())
            .filter((e): e is string => typeof e === 'string' && e.length > 0)

        console.info(`[migrate-subscribers] ${emails.length} suscripciones encontradas`)

        // Un subscriber sin user es un huérfano: no lo creamos (el acceso es
        // invite-only) pero lo reportamos para revisarlo a mano.
        const known = await User.find({ email: { $in: emails } }, { email: 1 }).lean()
        const knownEmails = new Set(known.map(u => u.email))
        const orphans = emails.filter(e => !knownEmails.has(e))
        if (orphans.length > 0) {
            console.warn(`[migrate-subscribers] ${orphans.length} sin user, se ignoran: ${orphans.join(', ')}`)
        }

        if (!apply) {
            console.info(`[migrate-subscribers] DRY RUN: prendería notifications en ${knownEmails.size} users. Re-corré con --apply`)
            return
        }

        const optIn = await User.updateMany(
            { email: { $in: [...knownEmails] } },
            { $set: { 'preferences.notifications': true } }
        )
        // El resto de los users queda con el default explícito, así el campo
        // existe en todos y las queries por `false` no dependen de $exists.
        const optOut = await User.updateMany(
            { 'preferences.notifications': { $exists: false } },
            { $set: { 'preferences.notifications': false } }
        )

        console.info(`[migrate-subscribers] notifications=true en ${optIn.modifiedCount}, default=false en ${optOut.modifiedCount}`)
        console.info('[migrate-subscribers] listo. Borrá la collection `subscribers` a mano cuando verifiques los datos.')
    } finally {
        await mongoose.disconnect()
    }
}

await main()
