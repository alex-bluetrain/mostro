import type { z } from 'zod'
import type { diapersStateSchema } from '../schemas/diapers-state.schema'

export type DiapersState = z.infer<typeof diapersStateSchema>
