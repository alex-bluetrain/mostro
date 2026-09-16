import { registerApiRoute } from '@mastra/core/server'
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'
import { classifierRepository } from '@business/repositories'
import { CLASSIFIER_DOMAINS, type ClassifierDomain } from '@business/models/classifier-snapshot.model'
import { requireAdmin } from '@lib/require-admin'
import { validateRules } from '@lib/mail-classifier/validate-rules'

function parseDomain(raw: string | undefined): ClassifierDomain | null {
    return CLASSIFIER_DOMAINS.includes(raw as ClassifierDomain) ? (raw as ClassifierDomain) : null
}

// Historial completo por dominio, con el puntero activo. Es una sola pantalla y
// son tres dominios: paginar o pedirlos de a uno sería más ida y vuelta que datos.
export const listClassifierRulesRoute = registerApiRoute('/classifier-rules', {
    method: 'GET',
    handler: async c => {
        const admin = await requireAdmin(c.get('requestContext')?.get(MASTRA_RESOURCE_ID_KEY))
        if (!admin) return c.json({ error: 'Forbidden' }, 403)

        const active = await classifierRepository.listActiveVersions()
        const domains = await Promise.all(
            CLASSIFIER_DOMAINS.map(async domain => ({
                domain,
                activeVersion: active[domain] ?? null,
                snapshots: await classifierRepository.listSnapshots(domain),
            })),
        )

        return c.json({ domains })
    },
})

// Detalle: las reglas completas de una versión. Inmutables, así que el cliente
// puede cachearlas sin miedo.
export const getClassifierSnapshotRoute = registerApiRoute('/classifier-rules/:domain/:version', {
    method: 'GET',
    handler: async c => {
        const admin = await requireAdmin(c.get('requestContext')?.get(MASTRA_RESOURCE_ID_KEY))
        if (!admin) return c.json({ error: 'Forbidden' }, 403)

        const domain = parseDomain(c.req.param('domain'))
        const version = Number(c.req.param('version'))
        if (!domain || !Number.isInteger(version)) {
            return c.json({ error: 'Invalid domain or version' }, 400)
        }

        const snapshot = await classifierRepository.findSnapshot(domain, version)
        if (!snapshot) return c.json({ error: 'Not found' }, 404)

        const active = await classifierRepository.listActiveVersions()
        return c.json({
            domain: snapshot.domain,
            version: snapshot.version,
            author: snapshot.author,
            changelog: snapshot.changelog,
            rules: snapshot.classification_rules,
            isActive: active[domain] === snapshot.version,
        })
    },
})

// Publicar = crear una versión nueva y activarla. Nunca se edita un snapshot:
// por eso no hay PUT sobre /:version.
export const publishClassifierSnapshotRoute = registerApiRoute('/classifier-rules/:domain', {
    method: 'POST',
    handler: async c => {
        const admin = await requireAdmin(c.get('requestContext')?.get(MASTRA_RESOURCE_ID_KEY))
        if (!admin) return c.json({ error: 'Forbidden' }, 403)

        const domain = parseDomain(c.req.param('domain'))
        if (!domain) return c.json({ error: 'Invalid domain' }, 400)

        const body = await c.req.json().catch(() => null)
        const changelog = typeof body?.changelog === 'string' ? body.changelog.trim() : ''
        if (!changelog) return c.json({ error: 'A changelog is required' }, 400)

        let rules
        try {
            rules = validateRules(body?.rules)
        } catch (err) {
            return c.json({ error: err instanceof Error ? err.message : 'Invalid rules' }, 400)
        }

        // El autor es quien está firmado, no lo que mande el cliente: el changelog
        // es historia y tiene que ser confiable.
        const version = await classifierRepository.publishSnapshot({
            domain,
            author: admin.name || admin.email,
            changelog,
            rules,
        })

        return c.json({ domain, version }, 201)
    },
})

// Rollback: mover el puntero a una versión que ya existe.
export const activateClassifierVersionRoute = registerApiRoute('/classifier-rules/:domain/active', {
    method: 'PUT',
    handler: async c => {
        const admin = await requireAdmin(c.get('requestContext')?.get(MASTRA_RESOURCE_ID_KEY))
        if (!admin) return c.json({ error: 'Forbidden' }, 403)

        const domain = parseDomain(c.req.param('domain'))
        if (!domain) return c.json({ error: 'Invalid domain' }, 400)

        const body = await c.req.json().catch(() => null)
        const version = Number(body?.version)
        if (!Number.isInteger(version)) return c.json({ error: 'A version is required' }, 400)

        const activated = await classifierRepository.activateVersion(domain, version)
        if (!activated) return c.json({ error: 'Not found' }, 404)

        return c.json({ domain, activeVersion: version })
    },
})
