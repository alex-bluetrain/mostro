import type { Message, RunAgentInput } from '@ag-ui/core'
import { MastraAgent } from '@ag-ui/mastra'
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context'
import { registerApiRoute } from '@mastra/core/server'
import { mostroSupervisor } from '../agents/mostro-supervisor'
import { webThreadMiddleware } from '@lib/web-thread'

// Puerta AG-UI del cliente web: `@ag-ui/mastra` traduce el stream del
// supervisor a eventos del protocolo AG-UI, que OpenUI parsea con agUIAdapter()
// del lado del browser. No hay `streamHandler`: la API es `run()`, que devuelve
// un Observable, y cada evento se serializa como SSE.
//
// El MastraAgent se crea por request, no a nivel módulo: lleva adentro el
// requestContext (de ahí sale CHANNEL_KEY, que es lo que hace que el supervisor
// conteste en openui-lang) y el traceId, que serían compartidos entre usuarios
// si la instancia fuera única.
export const agUIRoute = registerApiRoute('/agents/mostro-supervisor/openui', {
    method: 'POST',
    // Mismo middleware que /chat: exige el JWT y deriva el thread del token.
    middleware: webThreadMiddleware,
    handler: async c => {
        const requestContext = c.get('requestContext')
        const resourceId = requestContext.get(MASTRA_RESOURCE_ID_KEY) as string
        const threadId = requestContext.get(MASTRA_THREAD_ID_KEY) as string

        const { messages, state } = await c.req.json<{ messages: Message[]; state?: RunAgentInput['state'] }>()

        const agent = new MastraAgent({ agent: mostroSupervisor, resourceId, requestContext })
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            start(controller) {
                const subscription = agent
                    .run({ messages, state, threadId, runId: crypto.randomUUID(), tools: [], context: [] })
                    .subscribe({
                        next: event => {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                        },
                        complete: () => {
                            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                            controller.close()
                        },
                        error: (error: Error) => {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`))
                            controller.close()
                        },
                    })

                c.req.raw.signal.addEventListener('abort', () => subscription.unsubscribe())
            },
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
            },
        })
    },
})
