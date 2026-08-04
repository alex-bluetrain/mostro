import { appConfig } from '@config/app.config'
import type { InboxManagerConfig } from '@lib/inbox-manager/inbox-manager'

export const medsInboxConfig: InboxManagerConfig = {
    queryDescription: `mails de la farmacia (${appConfig.MEDS_EMAIL_TO}) de los últimos 30 días`,
}
