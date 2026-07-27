import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { extractFromMail } from './mail-extractor'

const schema = z.object({ deliveryDate: z.string(), quantity: z.number() })

function buildMastra(object: unknown) {
    const generate = vi.fn().mockResolvedValue({ object })
    const mastra = { getAgent: vi.fn().mockReturnValue({ generate }) }
    return { mastra, generate }
}

const args = {
    subject: 'Confirmación',
    body: 'Entregamos 12 unidades el 11/03.',
    description: 'la confirmación de la fecha de entrega',
    schema,
}

describe('extractFromMail', () => {
    it('devuelve los datos cuando el mail corresponde al step', async () => {
        const { mastra } = buildMastra({
            matches: true,
            reason: 'confirma la fecha de entrega',
            data: { deliveryDate: '2026-03-11', quantity: 12 },
        })

        const result = await extractFromMail(mastra as never, args)

        expect(result).toEqual({
            matches: true,
            reason: 'confirma la fecha de entrega',
            data: { deliveryDate: '2026-03-11', quantity: 12 },
        })
    })

    it('devuelve matches false con el motivo cuando el mail no corresponde', async () => {
        const { mastra } = buildMastra({
            matches: false,
            reason: 'es un aviso de vacaciones, no una confirmación',
        })

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('vacaciones')
        expect(result.data).toBeUndefined()
    })

    it('le pasa al modelo la descripción del step y el cuerpo del mail', async () => {
        const { mastra, generate } = buildMastra({ matches: true, reason: 'ok', data: { deliveryDate: 'x', quantity: 1 } })

        await extractFromMail(mastra as never, args)

        const prompt = generate.mock.calls[0][0] as string
        expect(prompt).toContain('la confirmación de la fecha de entrega')
        expect(prompt).toContain('Entregamos 12 unidades el 11/03.')
    })

    it('trata como no coincidente una salida que dice matches true sin datos válidos', async () => {
        const { mastra } = buildMastra({ matches: true, reason: 'ok', data: { deliveryDate: '2026-03-11' } })

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('no validaron')
    })

    it('trata como no coincidente un fallo del modelo', async () => {
        const generate = vi.fn().mockRejectedValue(new Error('rate limited'))
        const mastra = { getAgent: vi.fn().mockReturnValue({ generate }) }

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('rate limited')
    })

    it('trata como no coincidente cuando el agente no está registrado', async () => {
        const mastra = { getAgent: vi.fn().mockReturnValue(undefined) }

        const result = await extractFromMail(mastra as never, args)

        expect(result.matches).toBe(false)
        expect(result.reason).toContain('mailExtractor')
    })
})
