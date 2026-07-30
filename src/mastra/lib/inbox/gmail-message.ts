// Todo lo que sabe del formato de la API de Gmail vive acá: MIME anidado, headers con
// nulls del codegen de Google, base64url. El reader habla con la API; esta clase traduce
// lo que baja a la forma que consume el poller.

export type InboxMessage = {
    id: string
    from: string
    subject: string
    body: string
    receivedAt: Date
    // Solo los headers del nodo raíz (los del mail: From, Subject, Message-ID...);
    // los de las parts internas son metadata de encoding sin interés. Misma forma
    // array-de-pares que la API (los headers pueden repetirse y el orden importa),
    // pero sin los nulls del codegen de Google: Gmail siempre manda name y value.
    // Sin consumidores todavía: se expone para habilitar filtros futuros por header
    // (por ejemplo, atar un mail a su run vía Message-ID / In-Reply-To).
    headers: Array<{ name: string; value: string }>
}

type Payload = {
    headers?: Array<{ name?: string | null; value?: string | null }>
    mimeType?: string | null
    body?: { data?: string | null } | null
    parts?: Payload[]
}

// Lo mínimo que hace falta de un users.messages.get: acepta el Schema$Message del codegen
// de Google sin arrastrar su tipo hasta acá.
export type RawGmailMessage = {
    internalDate?: string | null
    payload?: unknown
}

export class GmailMessage {
    private readonly payload: Payload | undefined
    private readonly internalDate: string | null | undefined

    constructor(private readonly id: string, raw: RawGmailMessage) {
        this.payload = (raw.payload ?? undefined) as Payload | undefined
        this.internalDate = raw.internalDate
    }

    // "Farmacia <pedidos@farmacia.test>" -> "pedidos@farmacia.test". Sin display name
    // el header ya viene limpio.
    get from(): string {
        const header = this.header('From')
        const match = header.match(/<([^>]+)>/)
        return (match ? match[1] : header).trim().toLowerCase()
    }

    get subject(): string {
        return this.header('Subject')
    }

    // Un mail puede traer el texto directo o repartido en parts (multipart/alternative
    // con html + plano). Nos interesa el plano a cualquier profundidad; si no hay,
    // el primer body con contenido. Así queda explícito qué es lo preferido y qué el fallback.
    get body(): string {
        return GmailMessage.plainTextOf(this.payload) ?? GmailMessage.anyBodyOf(this.payload)
    }

    get headers(): Array<{ name: string; value: string }> {
        // name sí requiere contenido (un header sin nombre no sirve), pero value tolera
        // string vacío: un `Subject:` vacío es un header legítimo y no debe perderse.
        return (this.payload?.headers ?? []).flatMap(h => (h.name && h.value != null ? [{ name: h.name, value: h.value }] : []))
    }

    get receivedAt(): Date {
        return new Date(Number(this.internalDate ?? 0))
    }

    toInbox(): InboxMessage {
        return {
            id: this.id,
            from: this.from,
            subject: this.subject,
            body: this.body,
            receivedAt: this.receivedAt,
            headers: this.headers,
        }
    }

    private header(name: string): string {
        const header = this.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())
        return header?.value ?? ''
    }

    // null y no '' cuando no hay ninguna parte text/plain, para poder distinguir
    // "encontré el tipo preferido" de "no lo encontré y hay que caer al fallback".
    private static plainTextOf(payload: Payload | undefined): string | null {
        if (!payload) return null
        if (payload.mimeType === 'text/plain' && payload.body?.data) {
            return GmailMessage.decode(payload.body.data)
        }
        for (const part of payload.parts ?? []) {
            const found = GmailMessage.plainTextOf(part)
            if (found !== null) return found
        }
        return null
    }

    private static anyBodyOf(payload: Payload | undefined): string {
        if (!payload) return ''
        for (const part of payload.parts ?? []) {
            const found = GmailMessage.anyBodyOf(part)
            if (found) return found
        }
        return GmailMessage.decode(payload.body?.data)
    }

    private static decode(data: string | null | undefined): string {
        return data ? Buffer.from(data, 'base64url').toString('utf-8') : ''
    }
}
