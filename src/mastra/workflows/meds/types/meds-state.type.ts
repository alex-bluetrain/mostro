import type { z } from 'zod'
import type { medsStateSchema } from '../schemas/meds-state.schema'

export type MedsState = z.infer<typeof medsStateSchema>
