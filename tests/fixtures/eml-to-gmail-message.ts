import { readFile } from 'node:fs/promises'
import { MailParser } from 'mailparser'

export type GmailHeader = { name: string; value: string }

export type GmailPart = {
    mimeType: string
    headers?: GmailHeader[]
    body?: { data: string }
    parts?: GmailPart[]
}

export type GmailMessage = {
    id: string
    internalDate: string
    payload: GmailPart
}

// `MailParser.tree` no está en los tipos de `@types/mailparser`: es el árbol interno que
// mailparser arma mientras parsea, pero tiene exactamente la forma que necesitamos para imitar
// lo que devuelve `users.messages.get({format:'full'})` de Gmail. El cast de abajo es el único
// lugar donde se asume esta forma; tests/eml-to-gmail-message.test.ts la protege: si un upgrade
// de mailparser la cambia, ese test rompe en CI en vez de que el CLI mienta en silencio.
type MimeHeaderLine = { key: string; line: string }
type MimeNode = {
    contentType: string
    headerLines: MimeHeaderLine[]
    textContent?: string
    children: MimeNode[]
}

function encode(text: string): string {
    return Buffer.from(text, 'utf-8').toString('base64url')
}

function toHeaders(headerLines: MimeHeaderLine[]): GmailHeader[] {
    return headerLines.map(h => ({
        name: h.key,
        value: h.line.slice(h.line.indexOf(':') + 1).trim(),
    }))
}

function toGmailPart(node: MimeNode): GmailPart {
    const part: GmailPart = { mimeType: node.contentType }
    if (node.headerLines.length > 0) part.headers = toHeaders(node.headerLines)
    if (node.textContent) part.body = { data: encode(node.textContent) }
    if (node.children.length > 0) part.parts = node.children.map(toGmailPart)
    return part
}

export function fixtureUrl(name: string): URL {
    return new URL(`./mails/${name}`, import.meta.url)
}

export async function emlToGmailMessage(source: Buffer | URL | string): Promise<GmailMessage> {
    const buffer = Buffer.isBuffer(source) ? source : await readFile(source)

    const parser = new MailParser()
    const ended = new Promise<void>((resolve, reject) => {
        parser.on('error', reject)
        // Los adjuntos frenan el parser hasta que se los "libera": si no se drenan sus datos
        // y se llama release(), un .eml real con imágenes/PDFs nunca dispara 'end'.
        parser.on('data', (data: { type: string; release?: () => void }) => {
            if (data.type === 'attachment' && data.release) data.release()
        })
        parser.on('end', resolve)
    })
    parser.end(buffer)
    await ended

    const tree = (parser as unknown as { tree: MimeNode }).tree
    const payload = toGmailPart(tree)

    const dateHeader = tree.headerLines.find(h => h.key === 'date')
    const internalDate = dateHeader
        ? String(new Date(dateHeader.line.slice(dateHeader.line.indexOf(':') + 1).trim()).getTime())
        : String(Date.now())

    return { id: 'eml-local', internalDate, payload }
}
