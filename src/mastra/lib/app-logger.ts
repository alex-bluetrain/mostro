import axiomTransport from '@axiomhq/pino'
import { createCustomTransport } from '@mastra/core/logger'
import { PinoLogger } from '@mastra/loggers'
import { appConfig } from '@config/app.config'

// Logger del server. Si AXIOM_TOKEN y AXIOM_DATASET están seteadas, además de
// stdout los logs se envían a Axiom; si falta alguna, queda igual que antes.
// PinoLogger arma un multistream con los transports + el pretty stream, así que
// agregar Axiom nunca saca los logs de la consola.
async function createAppLogger(): Promise<PinoLogger> {
    const { AXIOM_TOKEN: token, AXIOM_DATASET: dataset } = appConfig

    if (!token || !dataset) {
        return new PinoLogger({ name: 'Mastra', level: 'info' })
    }

    const stream = await axiomTransport({ token, dataset })

    return new PinoLogger({
        name: 'Mastra',
        level: 'info',
        transports: { axiom: createCustomTransport(stream) },
    })
}

// El logger del boot (conexión a Mongo, seeds, ngrok, registro del /start) tiene
// que existir antes que la instancia de Mastra, así que se arma acá y se le pasa
// a Mastra ya construido. Dentro de un step o un tool usá mastra.getLogger(): ese
// viene envuelto en un DualLogger que correlaciona cada línea con el span de la
// corrida, cosa que este no puede hacer.
export const appLogger = await createAppLogger()

if (!appConfig.AXIOM_TOKEN || !appConfig.AXIOM_DATASET) {
    appLogger.warn('[axiom] AXIOM_TOKEN/AXIOM_DATASET no seteadas, logs solo a stdout')
}
