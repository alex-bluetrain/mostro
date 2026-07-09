import { z } from 'zod'

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
    requestedAt: z.string().optional(),
    acknowledgedAt: z.string().optional(),
    ackNotifiedAt: z.string().optional(),
    refundReference: z.string().optional(),
    confirmedAt: z.string().optional(),
    confirmationNotifiedAt: z.string().optional(),
    depositAmount: z.number().optional(),
    depositDate: z.string().optional(),
    depositReceivedAt: z.string().optional(),
    depositConfirmedAt: z.string().optional(),
    notifiedAt: z.string().optional(),
    notifiedCount: z.number().optional(),
})
