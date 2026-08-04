import { describe, it, expect, vi } from 'vitest'
import { Mastra } from '@mastra/core/mastra'
import { InboxManager } from '@lib/inbox-manager/inbox-manager'
import { classifyMail } from '@lib/mail-classifier/mail-classifier'
import type { ClassificationRules } from '@lib/mail-classifier/classification-rules.type'
import { inboxClassifierAgent } from '@agents/inbox-classifier-agent'
import { emlToGmailMessage, fixtureUrl } from './fixtures/eml-to-gmail-message'

const hasKey = Boolean(process.env.OPENROUTER_API_KEY) && process.env.OPENROUTER_API_KEY !== 'test-key'

function buildGmail(payload: unknown) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({ data: { id: 'm1', payload } })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({ data: { labels: [] } })
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

const rules: ClassificationRules = {
    outcomes: [
        { label: 'clasificado-entrega', condition: 'confirma que una entrega se realizó con éxito' },
        { label: 'clasificado-error', condition: 'informa un problema o error con un envío' },
    ],
    'default-outcome': { label: 'clasificado-otro' },
}

describe.skipIf(!hasKey)('InboxManager + classifyMail (integración)', () => {
    const mastra = new Mastra({ agents: { inboxClassifier: inboxClassifierAgent } })

    it.each([
        ['confirmacion-entrega.eml', 'clasificado-entrega'],
        ['error-envio.eml', 'clasificado-error'],
        ['mail-html.eml', 'clasificado-entrega'],
        ['mail-con-quoted.eml', 'clasificado-otro'],
        ['mail-generico.eml', 'clasificado-otro'],
    ])('clasifica %s como %s', async (fixture, expectedLabel) => {
        const { payload } = await emlToGmailMessage(fixtureUrl(fixture))
        const { gmail } = buildGmail(payload)

        const manager = new InboxManager({ queryDescription: 'mails de proveedores de farmacia de los últimos 30 días' }, gmail)
        await manager.init(mastra)
        const [mail] = await manager.fetch()
        const result = await classifyMail(mastra, mail.text, rules)

        expect(result.label).toBe(expectedLabel)
        expect(result.isDefault).toBe(expectedLabel === 'clasificado-otro')
    }, 60_000)

    it('traduce la query en lenguaje natural y agrega las exclusiones estáticas', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('confirmacion-entrega.eml'))
        const { gmail, list } = buildGmail(payload)
        const manager = new InboxManager({
            queryDescription: 'mails de farmacia@proveedor.test de los últimos 30 días',
        }, gmail)

        await manager.init(mastra)
        await manager.fetch()

        expect(list).toHaveBeenCalledWith(expect.objectContaining({
            q: expect.stringMatching(/from:/),
        }))
        expect(list).toHaveBeenCalledWith(expect.objectContaining({
            q: expect.stringMatching(/newer_than:30d/),
        }))
        expect(list).toHaveBeenCalledWith(expect.objectContaining({
            q: expect.stringContaining('-label:outcome.completed -label:outcome.failed -label:outcome.review'),
        }))
    }, 60_000)
})
