import { z } from 'zod'
import { unixTimestampSchema } from '../../../lib/unix-time'

export const refundsStateSchema = z.object({
    status: z.enum([
        'idle',
        'refund_requested',
        'refund_acknowledged',
        'ack_notified',
        'refund_confirmed',
        'confirmation_notified',
        'deposit_received',
        'deposit_confirmed',
        'refunds_notification_sent',
    ]).default('idle'),
    amount: z.number().optional(),
    reason: z.string().optional(),
    requestedBy: z.string().optional(),
    requestedAt: unixTimestampSchema.optional(),
    acknowledgedAt: unixTimestampSchema.optional(),
    ackNotifiedAt: unixTimestampSchema.optional(),
    refundReference: z.string().optional(),
    confirmedAt: unixTimestampSchema.optional(),
    confirmationNotifiedAt: unixTimestampSchema.optional(),
    depositAmount: z.number().optional(),
    depositDate: unixTimestampSchema.optional(),
    depositReceivedAt: unixTimestampSchema.optional(),
    depositConfirmedAt: unixTimestampSchema.optional(),
    notifiedAt: unixTimestampSchema.optional(),
    notifiedCount: z.number().optional(),
})
