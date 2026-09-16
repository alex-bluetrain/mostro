import { createSkill } from '@mastra/core/skills'

// Instrucciones que antes vivían en el weather agent (hoy colapsado en el
// loop único del supervisor). La tool get-weather vive en el catálogo.
export const weatherSkill = createSkill({
    name: 'weather',
    description:
        'Cómo responder preguntas de clima o pronóstico para una ciudad y sugerir actividades según el tiempo, usando la tool get-weather.',
    instructions: `# Clima y actividades

- Buscá y usá la tool \`get-weather\` para traer el clima actual de la ciudad.
- Si no te dieron la ubicación, pedila antes de llamar a la tool.
- Si el nombre de la ciudad no está en inglés, traducilo para la tool (ej: "Nueva York" → "New York").
- Si la ubicación tiene varias partes (ej: "New York, NY"), usá la parte más relevante ("New York").
- Incluí detalles relevantes: humedad, viento y precipitaciones.
- Si piden actividades, sugerilas en base al pronóstico, en el formato que pida el usuario.
- Mantené la respuesta concisa pero informativa.`,
})
