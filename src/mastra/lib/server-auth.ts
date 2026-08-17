import { SimpleAuth } from '@mastra/core/server'
import { appConfig } from '@config/app.config'
import { createGoogleAuth, TELEGRAM_CHANNEL_WEBHOOK } from './google-auth'

// Selección del auth provider por entorno:
// - STUDIO_API_KEY seteada → SimpleAuth. Exento del gate de licencia EE de
//   Studio (marker isSimpleAuth en @mastra/core), así que habilita Studio
//   local apuntando a prod sin licencia.
// - Si no → Google SSO como siempre (dev local, donde el gate no aplica).
//
// SimpleAuth acepta un mapa de tokens, así que soporta varios usuarios; acá
// declaramos uno solo porque el único consumidor hoy es Studio. Si sumás
// entradas, tené en cuenta que authorizeUser() acepta cualquier token del mapa
// para todo: no hay permisos por ruta ni por rol, y el mapa se congela en el
// boot (alta/baja de un usuario implica reiniciar).
export function createServerAuth() {
    if (appConfig.STUDIO_API_KEY) {
        return new SimpleAuth({
            tokens: {
                [appConfig.STUDIO_API_KEY]: {
                    id: 'admin',
                    name: appConfig.ADMIN_NAME ?? 'Admin',
                    role: 'admin',
                },
            },
            public: [TELEGRAM_CHANNEL_WEBHOOK],
        })
    }
    return createGoogleAuth()
}
