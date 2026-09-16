import { describe, expect, it, vi, beforeEach } from 'vitest'

const runMock = vi.fn()
const constructorMock = vi.fn()

vi.mock('@ag-ui/mastra', () => ({
    MastraAgent: class {
        constructor(config: unknown) {
            constructorMock(config)
        }
        run = runMock
    },
}))

import { agUIRoute } from './ag-ui.route'
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'

type Handler = (c: unknown) => Promise<Response>

function contextWith(body: unknown) {
    const store = new Map<string, unknown>([
        [MASTRA_RESOURCE_ID_KEY, 'ana@gmail.com'],
        [MASTRA_THREAD_ID_KEY, 'ana@gmail.com:web'],
    ])
    return {
        get: (key: string) => (key === 'requestContext' ? store : undefined),
        req: {
            json: async () => body,
            raw: { signal: new AbortController().signal },
        },
    }
}

async function readSse(response: Response): Promise<string> {
    return await new Response(response.body).text()
}

describe('agUIRoute', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        runMock.mockReturnValue({
            subscribe: ({ next, complete }: { next: (e: unknown) => void; complete: () => void }) => {
                next({ type: 'RUN_STARTED' })
                complete()
                return { unsubscribe: vi.fn() }
            },
        })
    })

    it('cuelga del middleware que exige el JWT y marca el canal web', () => {
        expect((agUIRoute as unknown as { middleware: unknown }).middleware).toBeDefined()
    })

    // Sin requestContext el supervisor no ve CHANNEL_KEY y contesta en texto
    // plano: el cliente OpenUI no sabe renderizar eso.
    it('le pasa el requestContext y el resourceId al bridge de AG-UI', async () => {
        const handler = (agUIRoute as unknown as { handler: Handler }).handler
        await handler(contextWith({ messages: [] }))

        expect(constructorMock).toHaveBeenCalledWith(
            expect.objectContaining({ resourceId: 'ana@gmail.com', requestContext: expect.anything() })
        )
    })

    // El thread sale del token (lo derivó webThreadMiddleware), nunca del body.
    it('usa el thread del contexto y no el que mande el cliente', async () => {
        const handler = (agUIRoute as unknown as { handler: Handler }).handler
        await handler(contextWith({ messages: [], threadId: 'victima@example.com:web' }))

        expect(runMock).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'ana@gmail.com:web' }))
    })

    it('serializa los eventos del Observable como SSE', async () => {
        const handler = (agUIRoute as unknown as { handler: Handler }).handler
        const response = await handler(contextWith({ messages: [] }))

        expect(response.headers.get('Content-Type')).toBe('text/event-stream')
        expect(await readSse(response)).toBe('data: {"type":"RUN_STARTED"}\n\ndata: [DONE]\n\n')
    })
})
