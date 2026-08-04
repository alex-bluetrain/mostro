import { appConfig } from '@config/app.config'
import type { InboxManagerConfig } from '@lib/inbox-manager/inbox-manager'

export const refundsInboxConfig: InboxManagerConfig = {
    queryDescription: `mails del área de reintegros (${appConfig.REFUNDS_EMAIL_TO}) de los últimos 30 días`,
}
