import axiomTransport from '@axiomhq/pino'
import { createCustomTransport } from '@mastra/core/logger'
import { PinoLogger } from '@mastra/loggers'
import { appConfig } from '@config/app.config'

// Logger del server. Si AXIOM_TOKEN y AXIOM_DATASET están seteadas, además de
// stdout los logs se envían a Axiom; si falta alguna, queda igual que antes.
// PinoLogger arma un multistream con los transports + el pretty stream, así que
// agregar Axiom nunca saca los logs de la consola.
export async function createAppLogger(): Promise<PinoLogger> {
    const { AXIOM_TOKEN: token, AXIOM_DATASET: dataset } = appConfig

    if (!token || !dataset) {
        console.warn('[axiom] AXIOM_TOKEN/AXIOM_DATASET no seteadas, logs solo a stdout')
        return new PinoLogger({ name: 'Mastra', level: 'info' })
    }

    const stream = await axiomTransport({ token, dataset })

    return new PinoLogger({
        name: 'Mastra',
        level: 'info',
        transports: { axiom: createCustomTransport(stream) },
    })
}
