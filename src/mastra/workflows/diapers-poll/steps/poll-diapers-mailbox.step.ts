import { createClassifierStep } from '@lib/inbox-classifier/classifier-step'
import { diapersInboxClassifierConfig } from '../diapers-inbox.classifier'

export const pollDiapersMailbox = createClassifierStep('poll-diapers-mailbox', diapersInboxClassifierConfig)
