import { createInviteTool } from './create-invite-tool'
import { linkDiscordTool } from './link-discord-tool'
import { weatherTool } from './weather-tool'
import { getDiapersStatusTool } from './diapers-get-status-tool'
import { requestDiapersTool } from './diapers-request-tool'
import { getMedsStatusTool } from './meds-get-status-tool'
import { requestMedsTool } from './meds-request-tool'

// Catálogo central de tools descubribles vía ToolSearchProcessor. Estas tools
// NO viven en el prompt del agente: el modelo las encuentra con search_tools y
// se cargan bajo demanda, así el costo de contexto no crece con el catálogo.
//
// Tool nueva = una entrada acá (+ su skill si necesita instrucciones). Las
// tools core del supervisor (subscribe, setMyName) quedan pineadas en el
// agente: el camino crítico nunca depende de la búsqueda.
export const toolRegistry = {
    createInviteTool,
    linkDiscordTool,
    weatherTool,
    getDiapersStatusTool,
    requestDiapersTool,
    getMedsStatusTool,
    requestMedsTool,
}
