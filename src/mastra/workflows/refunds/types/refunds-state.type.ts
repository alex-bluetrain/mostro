import type { z } from 'zod'
import type { refundsStateSchema } from '../schemas/refunds-state.schema'

export type RefundsState = z.infer<typeof refundsStateSchema>
