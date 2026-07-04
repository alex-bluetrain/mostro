import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type DiapersSubscriber = {
    resourceId: string
    threadId: string
}

// NOTA: no usar rutas relativas a import.meta.url — el bundler de `mastra dev`/`build`
// reubica este módulo, así que la ruta resuelve contra el bundle, no contra el código
// fuente. Se ancla a process.cwd() igual que `file:./mastra.db` en index.ts, que en
// runtime (dev y build) apunta a src/mastra/public/ (mismo directorio que mastra.db).
const SUBSCRIBERS_PATH = resolve(process.cwd(), 'diapers-subscribers.json')

async function readSubscribersFile(): Promise<DiapersSubscriber[]> {
    try {
        const raw = await readFile(SUBSCRIBERS_PATH, 'utf-8')
        return JSON.parse(raw)
    } catch (error: any) {
        if (error?.code === 'ENOENT') return []
        throw error
    }
}

async function writeSubscribersFile(subscribers: DiapersSubscriber[]): Promise<void> {
    await mkdir(dirname(SUBSCRIBERS_PATH), { recursive: true })
    await writeFile(SUBSCRIBERS_PATH, JSON.stringify(subscribers, null, 2), 'utf-8')
}

export async function addSubscriber(subscriber: DiapersSubscriber): Promise<void> {
    const subscribers = await readSubscribersFile()
    const exists = subscribers.some(
        s => s.resourceId === subscriber.resourceId && s.threadId === subscriber.threadId,
    )
    if (exists) return
    subscribers.push(subscriber)
    await writeSubscribersFile(subscribers)
}

export async function listSubscribers(): Promise<DiapersSubscriber[]> {
    return readSubscribersFile()
}
