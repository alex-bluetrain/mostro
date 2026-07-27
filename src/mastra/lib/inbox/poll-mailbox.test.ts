import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runPollCycle, readSuspendedStep } from './poll-mailbox'
import type { InboxMessage } from './gmail-reader'

const confirmSchema = z.object({ deliveryDate: z.string(), quantity: z.number() })

function message(overrides: Partial<InboxMessage> = {}): InboxMessage {
    return {
        id: 'm1',
        from: 'pedidos@farmacia.test',
        subject: 'Confirmación',
        body: 'Entregamos 12 el 11/03.',
        receivedAt: new Date('2026-07-15T10:00:00Z'),
        ...overrides,
    }
}

function buildConfig(resume = vi.fn().mockResolvedValue({ ok: true })) {
    return {
        config: {
            domain: 'diapers' as const,
            sender: 'pedidos@farmacia.test',
            workflowId: 'diapersWorkflow',
            getRunId: (ym: string) => `diapers-${ym}`,
            steps: {
                'wait-diapers-confirmation': {
                    schema: confirmSchema,
                    description: 'la confirmación de la fecha de entrega',
                    resume,
                },
            },
        },
        resume,
    }
}

function buildDeps(overrides: Record<string, unknown> = {}) {
    const addLabel = vi.fn().mockResolvedValue(undefined)
    const removeLabel = vi.fn().mockResolvedValue(undefined)
    const search = vi.fn().mockResolvedValue([message()])
    const extract = vi.fn().mockResolvedValue({
        matches: true,
        reason: 'confirma la entrega',
        data: { deliveryDate: '2026-03-11', quantity: 12 },
    })
    const notifyFailure = vi.fn().mockResolvedValue(1)
    const readSuspendedStep = vi.fn().mockResolvedValue('wait-diapers-confirmation')

    return {
        deps: { reader: { search, addLabel, removeLabel }, extract, notifyFailure, readSuspendedStep, ...overrides },
        search, addLabel, removeLabel, extract, notifyFailure, readSuspendedStep,
    }
}

describe('runPollCycle — query', () => {
    it('consulta solo el remitente del dominio, excluyendo lo ya etiquetado', async () => {
        const { config } = buildConfig()
        const { deps, search } = buildDeps()

        await runPollCycle({}, config, deps)

        const query = search.mock.calls[0][0] as string
        expect(query).toContain('from:pedidos@farmacia.test')
        expect(query).toContain('-label:mostro-processed')
        expect(query).toContain('-label:mostro-failed')
        expect(query).toContain('newer_than:30d')
    })
})

describe('runPollCycle — camino feliz', () => {
    it('reanuda el workflow y marca el mail como procesado', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()

        const result = await runPollCycle({}, config, deps)

        expect(resume).toHaveBeenCalledWith({}, { deliveryDate: '2026-03-11', quantity: 12 }, '2026-07')
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-processed')
        expect(notifyFailure).not.toHaveBeenCalled()
        expect(result).toEqual({ processed: 1, failed: 0 })
    })

    it('le pasa al extractor el schema y la descripción del step suspendido', async () => {
        const { config } = buildConfig()
        const { deps, extract } = buildDeps()

        await runPollCycle({}, config, deps)

        const args = extract.mock.calls[0][1]
        expect(args.schema).toBe(confirmSchema)
        expect(args.description).toBe('la confirmación de la fecha de entrega')
        expect(args.body).toBe('Entregamos 12 el 11/03.')
    })
})

describe('runPollCycle — resolución del mes', () => {
    it('usa el mes del mail cuando ahí hay un run suspendido', async () => {
        const { config, resume } = buildConfig()
        const { deps, readSuspendedStep } = buildDeps()

        await runPollCycle({}, config, deps)

        expect(readSuspendedStep).toHaveBeenCalledWith({}, 'diapersWorkflow', 'diapers-2026-07')
        expect(resume).toHaveBeenCalledWith({}, expect.anything(), '2026-07')
    })

    it('cae al mes anterior cuando el mes del mail no tiene run suspendido', async () => {
        const { config, resume } = buildConfig()
        const { deps, readSuspendedStep } = buildDeps()
        readSuspendedStep.mockImplementation(async (_m: unknown, _w: string, runId: string) =>
            runId === 'diapers-2026-06' ? 'wait-diapers-confirmation' : null)
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ receivedAt: new Date('2026-07-02T10:00:00Z') }),
        ])

        await runPollCycle({}, config, deps)

        expect(resume).toHaveBeenCalledWith({}, expect.anything(), '2026-06')
    })
})

describe('runPollCycle — fallos', () => {
    it('marca failed y avisa cuando no hay run suspendido en ningún mes', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()
        deps.readSuspendedStep = vi.fn().mockResolvedValue(null)

        const result = await runPollCycle({}, config, deps)

        expect(resume).not.toHaveBeenCalled()
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure).toHaveBeenCalledWith({}, expect.objectContaining({
            domain: 'diapers',
            from: 'pedidos@farmacia.test',
            subject: 'Confirmación',
        }))
        expect(result).toEqual({ processed: 0, failed: 1 })
    })

    it('marca failed cuando el step suspendido no está en el mapa del dominio', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()
        deps.readSuspendedStep = vi.fn().mockResolvedValue('notify-users')

        await runPollCycle({}, config, deps)

        expect(resume).not.toHaveBeenCalled()
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        const failure = notifyFailure.mock.calls[0][1]
        expect(failure.reason).toContain('notify-users')
    })

    it('marca failed con el motivo del extractor cuando el mail no corresponde', async () => {
        const { config, resume } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()
        deps.extract = vi.fn().mockResolvedValue({ matches: false, reason: 'es un aviso de vacaciones' })

        await runPollCycle({}, config, deps)

        expect(resume).not.toHaveBeenCalled()
        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure.mock.calls[0][1].reason).toBe('es un aviso de vacaciones')
    })

    it('marca failed cuando la función de resume rechaza', async () => {
        const resume = vi.fn().mockResolvedValue({ ok: false, reason: 'not_suspended' })
        const { config } = buildConfig(resume)
        const { deps, addLabel, notifyFailure } = buildDeps()

        await runPollCycle({}, config, deps)

        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure.mock.calls[0][1].reason).toContain('not_suspended')
    })

    it('marca failed cuando la función de resume lanza', async () => {
        const resume = vi.fn().mockRejectedValue(new Error('mongo caído'))
        const { config } = buildConfig(resume)
        const { deps, addLabel, notifyFailure } = buildDeps()

        const result = await runPollCycle({}, config, deps)

        expect(addLabel).toHaveBeenCalledWith('m1', 'mostro-failed')
        expect(notifyFailure.mock.calls[0][1].reason).toContain('mongo caído')
        expect(result).toEqual({ processed: 0, failed: 1 })
    })

    it('sigue procesando la tanda cuando el etiquetado falla', async () => {
        const { config } = buildConfig()
        const { deps } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'a' }),
            message({ id: 'b' }),
        ])
        deps.reader.addLabel = vi.fn()
            .mockRejectedValueOnce(new Error('gmail 503'))
            .mockResolvedValue(undefined)

        const result = await runPollCycle({}, config, deps)

        // El primero se reanudó igual: el fallo es solo de la etiqueta.
        expect(result).toEqual({ processed: 2, failed: 0 })
    })

    it('sigue procesando la tanda cuando el aviso de fallo lanza', async () => {
        const { config } = buildConfig()
        const { deps } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'a' }),
            message({ id: 'b' }),
        ])
        deps.extract = vi.fn().mockResolvedValue({ matches: false, reason: 'ruido' })
        deps.notifyFailure = vi.fn().mockRejectedValue(new Error('telegram caído'))

        const result = await runPollCycle({}, config, deps)

        expect(result).toEqual({ processed: 0, failed: 2 })
    })

    it('sigue con el resto de los mails cuando uno falla', async () => {
        const { config } = buildConfig()
        const { deps, addLabel } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'malo' }),
            message({ id: 'bueno' }),
        ])
        deps.extract = vi.fn()
            .mockResolvedValueOnce({ matches: false, reason: 'ruido' })
            .mockResolvedValueOnce({ matches: true, reason: 'ok', data: { deliveryDate: '2026-03-11', quantity: 12 } })

        const result = await runPollCycle({}, config, deps)

        expect(addLabel).toHaveBeenCalledWith('malo', 'mostro-failed')
        expect(addLabel).toHaveBeenCalledWith('bueno', 'mostro-processed')
        expect(result).toEqual({ processed: 1, failed: 1 })
    })

    it('marca failed y sigue con el resto de la tanda cuando el extractor rechaza', async () => {
        const { config } = buildConfig()
        const { deps, addLabel, notifyFailure } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'malo' }),
            message({ id: 'bueno' }),
        ])
        deps.extract = vi.fn()
            .mockRejectedValueOnce(new Error('schema inválido'))
            .mockResolvedValueOnce({ matches: true, reason: 'ok', data: { deliveryDate: '2026-03-11', quantity: 12 } })

        const result = await runPollCycle({}, config, deps)

        expect(addLabel).toHaveBeenCalledWith('malo', 'mostro-failed')
        expect(addLabel).toHaveBeenCalledWith('bueno', 'mostro-processed')
        expect(notifyFailure.mock.calls[0][1].reason).toContain('schema inválido')
        expect(result).toEqual({ processed: 1, failed: 1 })
    })
})

describe('readSuspendedStep', () => {
    // getWorkflow lanza cuando el id no está registrado, no devuelve undefined.
    it('devuelve null en vez de propagar cuando el workflow no está registrado', async () => {
        const mastra = {
            getWorkflow: vi.fn().mockImplementation(() => {
                throw new Error('Workflow with ID diapersWorkflow not found')
            }),
        }

        await expect(readSuspendedStep(mastra, 'diapersWorkflow', 'diapers-2026-07'))
            .resolves.toBeNull()
    })

    it('devuelve null cuando no existe el run', async () => {
        const mastra = {
            getWorkflow: vi.fn().mockReturnValue({
                getWorkflowRunById: vi.fn().mockResolvedValue(null),
            }),
        }

        await expect(readSuspendedStep(mastra, 'diapersWorkflow', 'diapers-2026-07'))
            .resolves.toBeNull()
    })

    it('devuelve el stepId cuando el run está suspendido', async () => {
        const run = { status: 'suspended', suspendedPaths: { 'wait-diapers-confirmation': [0] } }
        const mastra = {
            getWorkflow: vi.fn().mockReturnValue({
                getWorkflowRunById: vi.fn().mockResolvedValue(run),
            }),
        }

        await expect(readSuspendedStep(mastra, 'diapersWorkflow', 'diapers-2026-07'))
            .resolves.toBe('wait-diapers-confirmation')
    })

    it('devuelve null cuando el run existe pero no está suspendido', async () => {
        const run = { status: 'running' }
        const mastra = {
            getWorkflow: vi.fn().mockReturnValue({
                getWorkflowRunById: vi.fn().mockResolvedValue(run),
            }),
        }

        await expect(readSuspendedStep(mastra, 'diapersWorkflow', 'diapers-2026-07'))
            .resolves.toBeNull()
    })
})

describe('runPollCycle — estado que avanza dentro de la misma tanda', () => {
    it('relee el step suspendido por cada mail, no una vez por ciclo', async () => {
        const resume = vi.fn().mockResolvedValue({ ok: true })
        const config = {
            domain: 'meds' as const,
            sender: 'farmacia@proveedor.test',
            workflowId: 'medsWorkflow',
            getRunId: (ym: string) => `meds-${ym}`,
            steps: {
                'wait-meds-acknowledge': { schema: z.object({}), description: 'el acuse', resume },
                'wait-meds-confirmation': { schema: z.object({ deliveryDate: z.string() }), description: 'la entrega', resume },
            },
        }
        const { deps, extract, readSuspendedStep } = buildDeps()
        deps.reader.search = vi.fn().mockResolvedValue([
            message({ id: 'ack', body: 'Recibimos su pedido.' }),
            message({ id: 'entrega', body: 'Entregamos el 11/03.' }),
        ])
        // El primer mail avanza el run de acuse a confirmación.
        readSuspendedStep
            .mockResolvedValueOnce('wait-meds-acknowledge')
            .mockResolvedValueOnce('wait-meds-confirmation')
        extract
            .mockResolvedValueOnce({ matches: true, reason: 'acuse', data: {} })
            .mockResolvedValueOnce({ matches: true, reason: 'entrega', data: { deliveryDate: '2026-03-11' } })

        const result = await runPollCycle({}, config, deps)

        expect(readSuspendedStep).toHaveBeenCalledTimes(2)
        expect(extract.mock.calls[0][1].description).toBe('el acuse')
        expect(extract.mock.calls[1][1].description).toBe('la entrega')
        expect(result).toEqual({ processed: 2, failed: 0 })
    })
})
