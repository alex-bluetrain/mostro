// Publica un snapshot de reglas de clasificación en Mongo y mueve el puntero activo.
// El JSON vive FUERA del repo (contiene datos sensibles) y se pasa por --file.
//
// Uso: pnpm seed:classifier -- --domain diapers --file C:/path/rules.json --author "Alex" --changelog "seed inicial"

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { appConfig } from '@config/app.config'
import { classifierRepository } from '@business/repositories'
import { validateRules } from '@lib/mail-classifier/validate-rules'

const DOMAINS = ['diapers', 'meds', 'refunds'] as const
type Domain = (typeof DOMAINS)[number]

function fail(message: string): never {
    console.error(`[seed-classifier] ${message}`)
    process.exit(1)
}

function parseCliArgs(): { domain: Domain; file: string; author: string; changelog: string } {
    const { values } = parseArgs({
        options: {
            domain: { type: 'string' },
            file: { type: 'string' },
            author: { type: 'string' },
            changelog: { type: 'string' },
        },
    })
    const { domain, file, author, changelog } = values
    if (!domain || !file || !author || !changelog) {
        fail('faltan argumentos. Uso: --domain <diapers|meds|refunds> --file <path.json> --author <nombre> --changelog <texto>')
    }
    if (!DOMAINS.includes(domain as Domain)) fail(`dominio inválido "${domain}": tiene que ser uno de ${DOMAINS.join(', ')}`)
    return { domain: domain as Domain, file, author, changelog }
}

async function main(): Promise<void> {
    const { domain, file, author, changelog } = parseCliArgs()

    let raw: unknown
    try {
        raw = JSON.parse(readFileSync(file, 'utf-8'))
    } catch (error) {
        fail(`no pude leer/parsear ${file}: ${error instanceof Error ? error.message : error}`)
    }
    let rules
    try {
        rules = validateRules(raw)
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
    }

    await mongoose.connect(appConfig.MONGODB_URI, { dbName: appConfig.MONGODB_DB_NAME })
    try {
        const version = await classifierRepository.publishSnapshot({ domain, author, changelog, rules })
        console.info(`[seed-classifier] publicado snapshot v${version} de "${domain}" (${rules.outcomes.length} outcomes) y puntero actualizado`)
    } finally {
        await mongoose.disconnect()
    }
}

await main()
