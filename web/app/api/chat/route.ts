import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MastraAgent } from '@ag-ui/mastra'
import type { RunAgentInput } from '@ag-ui/client'
import type { NextRequest } from 'next/server'
import { MOSTRO_SUPERVISOR_INSTRUCTIONS } from 'mostro/mostro-supervisor'
import { createWebMastraApp } from 'mostro/web-mastra'

const openUiSystemPrompt = readFileSync(
    join(process.cwd(), 'src/generated/system-prompt.txt'),
    'utf-8',
)

// Same sqlite file the Telegram-bound Mastra app uses (src/mastra/index.ts),
// so the web surface reads/writes the same shared order state. Assumes this
// Next.js process is always started with cwd = web/ (true for `next dev`/
// `next start` via the package.json scripts).
const dbUrl = `file:${resolve(process.cwd(), '../src/mastra/public/mastra.db')}`

// Standalone Agent for the web surface — same brain as the Telegram-bound
// mostroSupervisor, but instructed to answer in openui-lang instead of plain
// text, and without the telegram channel (this process never sees Telegram
// traffic). Registered in its own lean Mastra app (see createWebMastraApp)
// so its domain tools (get-diapers-status, etc.) have a working
// `context.mastra` to read workflow state from.
const mostroSupervisorForWeb = createWebMastraApp(
    dbUrl,
    `${MOSTRO_SUPERVISOR_INSTRUCTIONS}\n\n${openUiSystemPrompt}`,
)

export async function POST(req: NextRequest) {
    const input: RunAgentInput = await req.json()

    const agent = new MastraAgent({
        agent: mostroSupervisorForWeb,
        resourceId: input.threadId,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            agent.run(input).subscribe({
                next: (event) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                },
                error: (error) => {
                    controller.error(error)
                },
                complete: () => {
                    controller.close()
                },
            })
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    })
}
