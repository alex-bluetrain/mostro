import { createClassifierStep } from '@lib/inbox-classifier/classifier-step'
import { medsInboxClassifierConfig } from '../meds-inbox.classifier'

export const pollMedsMailbox = createClassifierStep('poll-meds-mailbox', medsInboxClassifierConfig)
