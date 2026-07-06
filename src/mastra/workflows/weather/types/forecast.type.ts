import type { z } from 'zod'
import type { forecastSchema } from '../schemas/forecast.schema'

export type Forecast = z.infer<typeof forecastSchema>
