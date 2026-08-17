import { classifierRepository } from '@business/repositories'
import type { ClassifierDomain } from '@business/models/classifier-snapshot.model'
import { appConfig } from '@config/app.config'
import { validateRules } from './mail-classifier/validate-rules'

// Bootstrap seed-if-missing de las reglas de clasificación, en el mismo lugar del
// ciclo de vida que ensureAdminSeed(). Las reglas son una precondición de los polls,
// no un seed opcional: sin puntero activo el workflow falla en cada corrida.
//
// Semántica deliberada: si el dominio ya tiene puntero, NO se toca. El día que exista
// el front de administración, sus ediciones son la verdad y este bootstrap nunca las pisa.
const ENV_VAR_NAME: Record<ClassifierDomain, string> = {
    diapers: 'CLASSIFIER_RULES_DIAPERS',
    meds: 'CLASSIFIER_RULES_MEDS',
    refunds: 'CLASSIFIER_RULES_REFUNDS',
}

export async function ensureClassifierSeed(): Promise<void> {
    const templates: Record<ClassifierDomain, string | undefined> = {
        diapers: appConfig.CLASSIFIER_RULES_DIAPERS,
        meds: appConfig.CLASSIFIER_RULES_MEDS,
        refunds: appConfig.CLASSIFIER_RULES_REFUNDS,
    }

    for (const domain of Object.keys(templates) as ClassifierDomain[]) {
        if (await classifierRepository.hasActivePointer(domain)) {
            console.info(`[classifier-seed] "${domain}" ya tiene puntero activo, no se toca`)
            continue
        }

        const template = templates[domain]?.trim()
        if (!template) {
            console.error(
                `[classifier-seed] ⚠ dominio "${domain}" sin reglas activas y sin ${ENV_VAR_NAME[domain]} — el workflow ${domain}-poll va a fallar en cada corrida`
            )
            continue
        }

        // Un dominio roto no debe frenar el boot: los otros dominios y el bot de
        // Telegram tienen que seguir andando.
        try {
            const rules = validateRules(JSON.parse(template))
            const version = await classifierRepository.publishSnapshot({
                domain,
                author: 'boot-seed',
                changelog: 'seed automático desde env',
                rules,
            })
            console.info(`[classifier-seed] "${domain}" seedeado: snapshot v${version} (${rules.outcomes.length} outcomes)`)
        } catch (error) {
            console.error(
                `[classifier-seed] ⚠ ${ENV_VAR_NAME[domain]} inválida, "${domain}" queda sin reglas: ${error instanceof Error ? error.message : error}`
            )
        }
    }
}
