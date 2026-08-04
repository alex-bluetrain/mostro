import { appConfig } from '@config/app.config'
import type { InboxManagerConfig } from '@lib/inbox-manager/inbox-manager'

export const diapersInboxConfig: InboxManagerConfig = {
    queryDescription: `mails del proveedor de pañales (${appConfig.DIAPERS_EMAIL_TO}) de los últimos 30 días`,
}
