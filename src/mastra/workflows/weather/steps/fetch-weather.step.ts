import { createStep } from '@mastra/core/workflows'
import { fetchWeatherInputSchema } from '../schemas/fetch-weather-input.schema'
import { forecastSchema } from '../schemas/forecast.schema'
import { getWeatherCondition } from '../utils/weather.utils';

export const fetchWeatherStep = createStep({
    id: 'fetch-weather',
    description: 'Fetches weather forecast for a given city',
    inputSchema: fetchWeatherInputSchema,
    outputSchema: forecastSchema,
    execute: async ({ inputData }) => {
        if (!inputData) {
            throw new Error('Input data not found');
        }

        const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.city)}&count=1`;
        const geocodingResponse = await fetch(geocodingUrl);
        const geocodingData = (await geocodingResponse.json()) as {
            results: { latitude: number; longitude: number; name: string }[];
        };

        if (!geocodingData.results?.[0]) {
            throw new Error(`Location '${inputData.city}' not found`);
        }

        const { latitude, longitude, name } = geocodingData.results[0];

        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;
        const response = await fetch(weatherUrl);
        const data = (await response.json()) as {
            current: {
                time: string
                precipitation: number
                weathercode: number
            }
            hourly: {
                precipitation_probability: number[]
                temperature_2m: number[]
            }
        }

        const forecast = {
            date: new Date().toISOString(),
            maxTemp: Math.max(...data.hourly.temperature_2m),
            minTemp: Math.min(...data.hourly.temperature_2m),
            condition: getWeatherCondition(data.current.weathercode),
            precipitationChance: data.hourly.precipitation_probability.reduce(
                (acc, curr) => Math.max(acc, curr),
                0
            ),
            location: name
        }

        return forecast;
    },
});
