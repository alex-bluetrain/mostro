import { FAILED_LABEL, SEARCH_WINDOW } from './poll-mailbox'
import { gmailReader, type InboxReader } from './gmail-reader'

// Sacarles el label los devuelve al query del poller: el próximo ciclo los levanta.
// Lo que se deja etiquetado queda descartado para siempre, que es el comportamiento
// deseado para el ruido con etiqueta: mails que sí matchearon el filtro del dominio
// pero fallaron en la extracción o en la reanudación. El ruido de otro remitente
// (publicidades, avisos generales de un proveedor que nunca pasa el filtro de
// `matches`) ni siquiera llega a etiquetarse — el poller lo saltea en silencio.
//
// Sin embargo, si un mail falla y queda fuera de la ventana de búsqueda (SEARCH_WINDOW),
// no se puede destrabar automáticamente: el poller nunca lo levantaría porque su query
// tiene SEARCH_WINDOW incluido. Por eso devolvemos dos conteos: retried (destrabados)
// y outOfWindow (etiquetados como fallidos pero fuera de la ventana, que pueden
// recuperarse manualmente desde Gmail).
export async function retryFailedMails(
    sender: string,
    reader: InboxReader = gmailReader,
): Promise<{ retried: number; outOfWindow: number }> {
    // Mails que sí se pueden destrabar: están dentro de la ventana
    const inWindow = await reader.search(`from:${sender} label:${FAILED_LABEL} ${SEARCH_WINDOW}`)
    for (const message of inWindow) {
        await reader.removeLabel(message.id, FAILED_LABEL)
    }

    // Mails que quedaron fuera de la ventana: dejarles el label para que no se pierdan
    const outOfWindow = await reader.search(`from:${sender} label:${FAILED_LABEL} -${SEARCH_WINDOW}`)

    return { retried: inWindow.length, outOfWindow: outOfWindow.length }
}
