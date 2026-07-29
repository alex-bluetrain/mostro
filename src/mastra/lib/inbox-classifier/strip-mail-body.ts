import * as cheerio from 'cheerio'
import EmailReplyParser from 'email-reply-parser'

type Payload = {
    mimeType?: string | null
    body?: { data?: string | null } | null
    parts?: Payload[]
}

export function stripMailBody(payload: unknown): string {
    const root = payload as Payload | undefined

    const plain = findPart(root, 'text/plain')
    if (plain) return new EmailReplyParser().read(decode(plain)).getVisibleText()

    const html = findPart(root, 'text/html')
    if (html) {
        const $ = cheerio.load(decode(html))
        $('script, style, head').remove()
        // cheerio's .text() just concatenates text nodes, so adjacent block elements (e.g.
        // <td>Fecha</td><td>11/03</td>) come out glued together with no whitespace. Appending a
        // space after each common block element before extracting text keeps them separated.
        $('td, th, tr, p, div, br, li, h1, h2, h3, h4, h5, h6').append(' ')
        return $.text().replace(/\s+/g, ' ').trim()
    }

    return ''
}

function findPart(payload: Payload | undefined, mimeType: string): Payload | null {
    if (!payload) return null
    if (payload.mimeType === mimeType && payload.body?.data) return payload
    for (const part of payload.parts ?? []) {
        const found = findPart(part, mimeType)
        if (found) return found
    }
    return null
}

function decode(part: Payload): string {
    return Buffer.from(part.body?.data ?? '', 'base64url').toString('utf-8')
}
