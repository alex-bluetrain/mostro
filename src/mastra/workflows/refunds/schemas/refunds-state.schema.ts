import { z } from 'zod'
import { unixTimestampSchema } from '@lib/unix-time'

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
    // El mes del pedido: lo fija quien arranca el run y queda en el estado, así los steps no
    // tienen que parsearlo del run id.
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    amount: z.number().optional(),
    reason: z.string().optional(),
    requestedBy: z.string().min(1),
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
