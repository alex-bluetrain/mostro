import { describe, it, expect, vi } from 'vitest'
import { Mastra } from '@mastra/core/mastra'
import { InboxClassifier, type InboxClassifierConfig } from '@lib/inbox-classifier/inbox-classifier'
import { inboxClassifierAgent } from '@agents/inbox-classifier-agent'
import { emlToGmailPayload } from './fixtures/eml-to-gmail-payload'

const hasKey = Boolean(process.env.OPENROUTER_API_KEY) && process.env.OPENROUTER_API_KEY !== 'test-key'

function buildGmail(payload: unknown) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({ data: { id: 'm1', payload } })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({
        data: {
            labels: [
                { id: 'L1', name: 'clasificado-entrega' },
                { id: 'L2', name: 'clasificado-error' },
                { id: 'L3', name: 'clasificado-otro' },
            ],
        },
    })
    const labelsCreate = vi.fn().mockResolvedValue({ data: { id: 'L9' } })

    return {
        gmail: {
            users: {
                messages: { list, get, modify },
                labels: { list: labelsList, create: labelsCreate },
            },
        } as never,
        list, get, modify, labelsList, labelsCreate,
    }
}

const config: InboxClassifierConfig = {
    queryDescription: 'mails de proveedores de farmacia de los últimos 30 días',
    outcomes: [
        { label: 'clasificado-entrega', description: 'confirma que una entrega se realizó con éxito' },
        { label: 'clasificado-error', description: 'informa un problema o error con un envío' },
        { label: 'clasificado-otro', description: 'catch-all: cualquier otra cosa' },
    ],
}

const labelIdToName: Record<string, string> = { L1: 'clasificado-entrega', L2: 'clasificado-error', L3: 'clasificado-otro' }

describe.skipIf(!hasKey)('InboxClassifier (integración)', () => {
    const mastra = new Mastra({ agents: { inboxClassifier: inboxClassifierAgent } })

    it.each([
        ['confirmacion-entrega.eml', 'clasificado-entrega'],
        ['error-envio.eml', 'clasificado-error'],
        ['mail-html.eml', 'clasificado-entrega'],
        ['mail-con-quoted.eml', 'clasificado-otro'],
        ['mail-generico.eml', 'clasificado-otro'],
    ])('clasifica %s como %s', async (fixture, expectedLabel) => {
        const payload = await emlToGmailPayload(fixture, fixture === 'mail-html.eml' ? 'html' : undefined)
        const { gmail, modify } = buildGmail(payload)

        const classifier = new InboxClassifier(mastra, config, gmail)
        await classifier.init()
        await classifier.run()

        const [{ requestBody }] = modify.mock.calls[0]
        const [labelId] = requestBody.addLabelIds
        expect(labelIdToName[labelId]).toBe(expectedLabel)
    }, 60_000)

    it('traduce la query en lenguaje natural a sintaxis de Gmail', async () => {
        const payload = await emlToGmailPayload('confirmacion-entrega.eml')
        const { gmail, list } = buildGmail(payload)
        const classifier = new InboxClassifier(mastra, {
            queryDescription: 'mails de farmacia@proveedor.test de los últimos 30 días',
            outcomes: config.outcomes,
        }, gmail)

        await classifier.init()
        await classifier.run()

        expect(list).toHaveBeenCalledWith(expect.objectContaining({
            q: expect.stringMatching(/from:/),
        }))
        expect(list).toHaveBeenCalledWith(expect.objectContaining({
            q: expect.stringMatching(/newer_than:30d/),
        }))
    }, 60_000)
})
