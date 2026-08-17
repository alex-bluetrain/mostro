import { beforeEach, describe, expect, it, vi } from 'vitest'

const validRules = JSON.stringify({
    outcomes: [{ label: 'confirmada', condition: 'el mail confirma la entrega' }],
    'default-outcome': { label: 'revisar' },
})

const config: Record<string, string | undefined> = {}

const hasActivePointer = vi.fn(async (_domain: string) => false)
const publishSnapshot = vi.fn(async (_input: unknown) => 1)

vi.mock('@config/app.config', () => ({ appConfig: config }))
vi.mock('@business/repositories', () => ({
    classifierRepository: {
        hasActivePointer: (domain: string) => hasActivePointer(domain),
        publishSnapshot: (input: unknown) => publishSnapshot(input),
    },
}))

const { ensureClassifierSeed } = await import('@lib/classifier-seed')

describe('ensureClassifierSeed', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        hasActivePointer.mockImplementation(async () => false)
        publishSnapshot.mockImplementation(async () => 1)
        config.CLASSIFIER_RULES_DIAPERS = undefined
        config.CLASSIFIER_RULES_MEDS = undefined
        config.CLASSIFIER_RULES_REFUNDS = undefined
        vi.spyOn(console, 'info').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('con puntero activo no publica nada, aunque haya template en env', async () => {
        hasActivePointer.mockImplementation(async () => true)
        config.CLASSIFIER_RULES_DIAPERS = validRules

        await ensureClassifierSeed()

        expect(publishSnapshot).not.toHaveBeenCalled()
    })

    it('sin puntero y con template válido publica el snapshot inicial', async () => {
        config.CLASSIFIER_RULES_DIAPERS = validRules

        await ensureClassifierSeed()

        expect(publishSnapshot).toHaveBeenCalledExactlyOnceWith({
            domain: 'diapers',
            author: 'boot-seed',
            changelog: 'seed automático desde env',
            rules: JSON.parse(validRules),
        })
    })

    it('sin puntero y sin template avisa por error y no tumba el boot', async () => {
        await expect(ensureClassifierSeed()).resolves.toBeUndefined()

        expect(publishSnapshot).not.toHaveBeenCalled()
        expect(console.error).toHaveBeenCalledTimes(3)
        expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain('CLASSIFIER_RULES_DIAPERS')
    })

    it('template vacío se trata como ausente', async () => {
        config.CLASSIFIER_RULES_MEDS = '   '

        await ensureClassifierSeed()

        expect(publishSnapshot).not.toHaveBeenCalled()
        expect(vi.mocked(console.error).mock.calls[1]?.[0]).toContain('CLASSIFIER_RULES_MEDS')
    })

    it('template inválido no publica y no lanza, y no frena los otros dominios', async () => {
        config.CLASSIFIER_RULES_DIAPERS = '{ no soy json'
        config.CLASSIFIER_RULES_MEDS = JSON.stringify({ outcomes: [] })
        config.CLASSIFIER_RULES_REFUNDS = validRules

        await expect(ensureClassifierSeed()).resolves.toBeUndefined()

        expect(publishSnapshot).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ domain: 'refunds' }))
        expect(console.error).toHaveBeenCalledTimes(2)
    })
})
