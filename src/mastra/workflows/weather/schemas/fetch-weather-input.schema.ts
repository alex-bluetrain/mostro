import { z } from 'zod'

export const fetchWeatherInputSchema = z.object({
    city: z.string().describe('The city to get the weather for'),
})
