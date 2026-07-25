// La Gmail API recibe el mensaje entero (headers + cuerpo) en un solo campo `raw`,
// codificado en base64url. Esto lo arma.

// RFC 2047: los headers son ASCII, así que un asunto con acentos viaja codificado.
function encodeSubject(subject: string): string {
    return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

export function buildRawMessage({
    from,
    to,
    subject,
    text,
}: {
    from: string
    to: string
    subject: string
    text: string
}): string {
    const headers = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${encodeSubject(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        // Sin esto el default RFC 2045 es 7bit, pero los cuerpos llevan acentos (pañales, Depósito).
        'Content-Transfer-Encoding: 8bit',
    ]

    const message = `${headers.join('\r\n')}\r\n\r\n${text}`
    return Buffer.from(message, 'utf8').toString('base64url')
}
