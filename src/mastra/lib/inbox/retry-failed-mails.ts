import { FAILED_LABEL, gmailReader, type GmailReader } from './gmail-reader'

// Sacarles el label los devuelve al query del poller: el próximo ciclo los levanta.
// Lo que se deja etiquetado queda descartado para siempre, que es el comportamiento
// deseado para el ruido (publicidades, avisos generales del proveedor).
export async function retryFailedMails(sender: string, reader: GmailReader = gmailReader): Promise<number> {
    const messages = await reader.search(`from:${sender} label:${FAILED_LABEL}`)

    for (const message of messages) {
        await reader.removeLabel(message.id, FAILED_LABEL)
    }

    return messages.length
}
