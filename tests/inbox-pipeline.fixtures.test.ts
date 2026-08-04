import { describe, it, expect, vi } from 'vitest'
import { InboxManager, type InboxManagerConfig } from '@lib/inbox-manager/inbox-manager'
import { classifyMail } from '@lib/mail-classifier/mail-classifier'
import type { ClassificationRules } from '@lib/mail-classifier/classification-rules.type'
import { emlToGmailMessage, fixtureUrl } from './fixtures/eml-to-gmail-message'

function buildGmail(payload: unknown) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({ data: { id: 'm1', payload } })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({ data: { labels: [{ id: 'L1', name: 'clasificado-entrega' }, { id: 'L2', name: 'clasificado-error' }, { id: 'L3', name: 'clasificado-otro' }] } })
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

function buildMastra(responses: unknown[]) {
    const generate = vi.fn()
    responses.forEach(object => generate.mockResolvedValueOnce({ object }))
    const mastra = { getAgent: vi.fn().mockReturnValue({ generate }) }
    return { mastra, generate }
}

const config: InboxManagerConfig = {
    queryDescription: 'mails de proveedores de farmacia de los últimos 30 días',
}

const rules: ClassificationRules = {
    outcomes: [
        { label: 'clasificado-entrega', condition: 'confirma que una entrega se realizó con éxito' },
        { label: 'clasificado-error', condition: 'informa un problema o error con un envío' },
    ],
    'default-outcome': { label: 'clasificado-otro' },
}

describe('InboxManager + classifyMail con fixtures .eml reales', () => {
    it('clasifica una confirmación de entrega y etiqueta con el label correcto', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('confirmacion-entrega.eml'))
        const { gmail, modify } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-entrega' },
        ])

        const manager = new InboxManager(config, gmail)
        await manager.init(mastra as never)
        const [mail] = await manager.fetch()
        const result = await classifyMail(mastra as never, mail.text, rules)
        await manager.applyLabel(mail.id, result.label)

        expect(generate.mock.calls[1][0]).toContain('entrega del pedido #4821')
        expect(result.isDefault).toBe(false)
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        })
    })

    it('clasifica un error de envío con el segundo outcome', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('error-envio.eml'))
        const { gmail, modify } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-error' },
        ])

        const manager = new InboxManager(config, gmail)
        await manager.init(mastra as never)
        const [mail] = await manager.fetch()
        const result = await classifyMail(mastra as never, mail.text, rules)
        await manager.applyLabel(mail.id, result.label)

        expect(generate.mock.calls[1][0]).toContain('no pudimos completar el envio')
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        })
    })

    it('parsea la parte HTML separando celdas de tabla con espacios', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('mail-html.eml'))
        const { gmail } = buildGmail(payload)
        const { mastra } = buildMastra([{ query: 'from:farmacia.test newer_than:30d' }])

        const manager = new InboxManager(config, gmail)
        await manager.init(mastra as never)
        const [mail] = await manager.fetch()

        expect(mail.text).toContain('Fecha 29/07/2026')
        expect(mail.text).toContain('Pedido 4823')
        expect(mail.text).not.toContain('<td')
        expect(mail.text).not.toContain('<style')
    })

    it('quita el texto citado de un mail con respuesta', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('mail-con-quoted.eml'))
        const { gmail } = buildGmail(payload)
        const { mastra } = buildMastra([{ query: 'from:farmacia.test newer_than:30d' }])

        const manager = new InboxManager(config, gmail)
        await manager.init(mastra as never)
        const [mail] = await manager.fetch()

        expect(mail.text).toContain('horario de atencion los fines de semana')
        expect(mail.text).not.toContain('queria consultar por el estado del reintegro')
    })

    it('cae en el default-outcome para un mail genérico', async () => {
        const { payload } = await emlToGmailMessage(fixtureUrl('mail-generico.eml'))
        const { gmail, modify } = buildGmail(payload)
        const { mastra } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-otro' },
        ])

        const manager = new InboxManager(config, gmail)
        await manager.init(mastra as never)
        const [mail] = await manager.fetch()
        const result = await classifyMail(mastra as never, mail.text, rules)
        await manager.applyLabel(mail.id, result.label)

        expect(result.isDefault).toBe(true)
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L3'] },
        })
    })
})
