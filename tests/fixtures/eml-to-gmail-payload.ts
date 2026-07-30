import { readFile } from 'node:fs/promises'
import { simpleParser } from 'mailparser'

export type GmailPayload = {
    mimeType: string
    body: { data: string }
}

function encode(text: string) {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function fixturePath(fixtureName: string) {
    return new URL(`./mails/${fixtureName}`, import.meta.url)
}

export async function readFixtureText(fixtureName: string): Promise<string> {
    const buffer = await readFile(fixturePath(fixtureName))
    return buffer.toString('utf-8')
}

export async function emlToGmailPayload(fixtureName: string, prefer?: 'html'): Promise<GmailPayload> {
    const buffer = await readFile(fixturePath(fixtureName))
    const parsed = await simpleParser(buffer)

    if (prefer !== 'html' && parsed.text) {
        return { mimeType: 'text/plain', body: { data: encode(parsed.text) } }
    }

    if (parsed.html) {
        return { mimeType: 'text/html', body: { data: encode(parsed.html) } }
    }

    if (parsed.text) {
        return { mimeType: 'text/plain', body: { data: encode(parsed.text) } }
    }

    throw new Error(`Fixture "${fixtureName}" no tiene texto ni HTML parseable`)
}
