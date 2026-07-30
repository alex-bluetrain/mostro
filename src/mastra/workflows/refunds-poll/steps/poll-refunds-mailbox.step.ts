import { createClassifierStep } from '@lib/inbox-classifier/classifier-step'
import { refundsInboxClassifierConfig } from '../refunds-inbox.classifier'

export const pollRefundsMailbox = createClassifierStep('poll-refunds-mailbox', refundsInboxClassifierConfig)
