import { createWorkflow } from '@mastra/core/workflows';
import { fetchWeatherInputSchema } from './schemas/fetch-weather-input.schema'
import { planActivitiesOutputSchema } from './schemas/plan-activities-output.schema'
import { fetchWeatherStep } from './steps/fetch-weather.step'
import { planActivitiesStep } from './steps/plan-activities.step'

export const weatherWorkflow = createWorkflow({
    id: 'weather-workflow',
    inputSchema: fetchWeatherInputSchema,
    outputSchema: planActivitiesOutputSchema,
})
    .then(fetchWeatherStep)
    .then(planActivitiesStep);

weatherWorkflow.commit();
