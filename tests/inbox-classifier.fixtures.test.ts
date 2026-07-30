import { describe, it, expect, vi } from 'vitest'
import { InboxClassifier, type InboxClassifierConfig } from '@lib/inbox-classifier/inbox-classifier'
import { emlToGmailPayload } from './fixtures/eml-to-gmail-payload'

function buildGmail(payload: unknown) {
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: 'm1' }] } })
    const get = vi.fn().mockResolvedValue({ data: { id: 'm1', payload } })
    const modify = vi.fn().mockResolvedValue({})
    const labelsList = vi.fn().mockResolvedValue({ data: { labels: [{ id: 'L1', name: 'clasificado-entrega' }, { id: 'L2', name: 'clasificado-error' }, { id: 'L3', name: 'clasificado-otro' }, { id: 'L4', name: 'clasificado-acknowledge' }] } })
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

const config: InboxClassifierConfig = {
    queryDescription: 'mails de proveedores de farmacia de los últimos 30 días',
    outcomes: [
        { label: 'clasificado-entrega', description: 'confirma que una entrega se realizó con éxito' },
        { label: 'clasificado-error', description: 'informa un problema o error con un envío' },
        { label: 'clasificado-acknowledge', description: 'confirma que una solicitud o pedido fue recibido, sin informar aún fecha de entrega' },
        { label: 'clasificado-otro', description: 'catch-all: cualquier otra cosa' },
    ],
}

describe('InboxClassifier con fixtures .eml reales', () => {
    it('clasifica una confirmación de entrega y etiqueta con el label correcto', async () => {
        const payload = await emlToGmailPayload('confirmacion-entrega.eml')
        const { gmail, modify } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-entrega' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(generate.mock.calls[1][0]).toContain('entrega del pedido #4821')
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        })
    })

    it('clasifica un error de envío con el segundo outcome', async () => {
        const payload = await emlToGmailPayload('error-envio.eml')
        const { gmail, modify } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-error' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(generate.mock.calls[1][0]).toContain('no pudimos completar el envio')
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L2'] },
        })
    })

    it('parsea la parte HTML separando celdas de tabla con espacios', async () => {
        const payload = await emlToGmailPayload('mail-html.eml', 'html')
        const { gmail } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-otro' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        const prompt = generate.mock.calls[1][0] as string
        expect(prompt).toContain('Fecha 29/07/2026')
        expect(prompt).toContain('Pedido 4823')
        expect(prompt).not.toContain('<td')
        expect(prompt).not.toContain('<style')
    })

    it('quita el texto citado de un mail con respuesta', async () => {
        const payload = await emlToGmailPayload('mail-con-quoted.eml')
        const { gmail } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-otro' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        const prompt = generate.mock.calls[1][0] as string
        expect(prompt).toContain('horario de atencion los fines de semana')
        expect(prompt).not.toContain('queria consultar por el estado del reintegro')
    })

    it('cae en el catch-all para un mail genérico', async () => {
        const payload = await emlToGmailPayload('mail-generico.eml')
        const { gmail, modify } = buildGmail(payload)
        const { mastra } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-otro' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L3'] },
        })
    })

    it('procesa un mail real reenviado con historial extenso y adjunto embebido', async () => {
        const payload = await emlToGmailPayload('pharmacy-meds-confirmation.eml')
        const { gmail, modify } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-entrega' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        const prompt = generate.mock.calls[1][0] as string
        expect(prompt).toContain('CONFIRMACIÓN DE ENTREGA')
        expect(prompt).toContain('Miércoles 15 de Julio')
        expect(prompt).not.toContain('Rosa Medina')
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L1'] },
        })
    })

    it('procesa un mail real de acuse de recibo cuyo contenido está en una imagen embebida', async () => {
        const payload = await emlToGmailPayload('pharmacy-meds-acknowledge.eml')
        const { gmail, modify } = buildGmail(payload)
        const { mastra, generate } = buildMastra([
            { query: 'from:farmacia.test newer_than:30d' },
            { label: 'clasificado-acknowledge' },
        ])

        const classifier = new InboxClassifier(mastra as never, config, gmail)
        await classifier.init()
        await classifier.run()

        const prompt = generate.mock.calls[1][0] as string
        expect(prompt).toContain('Forwarded message')
        expect(prompt).toContain('FARMADEMO')
        expect(modify).toHaveBeenCalledWith({
            userId: 'me',
            id: 'm1',
            requestBody: { addLabelIds: ['L4'] },
        })
    })
})
