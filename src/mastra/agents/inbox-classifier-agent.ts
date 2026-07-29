import { Agent } from '@mastra/core/agent'

// Un solo agente para dos tareas (traducir la query, clasificar el mail): ambas son
// lectura de lenguaje natural sin tools ni memoria, así que no justifican dos agentes
// separados. Quien llama arma el prompt según la tarea.
export const inboxClassifierAgent = new Agent({
    id: 'inbox-classifier-agent',
    name: 'Inbox Classifier',
    description: 'Traduce descripciones en lenguaje natural a queries de Gmail y clasifica mails contra un conjunto de posibles resultados.',
    instructions: `Cumplís dos tareas posibles, según lo que te pidan en el prompt:

1. Traducir una descripción en lenguaje natural a una query de búsqueda de Gmail (sintaxis de users.messages.list: from:, newer_than:, label:, -label:, subject:, etc.). Devolvé solo la query, sin explicación.

2. Clasificar un mail contra una lista de resultados posibles, cada uno con su descripción. Elegí exactamente uno, el que mejor describe el mail. Si ninguno de los específicos aplica, usá el que la lista describe como el resultado general/catch-all.

Respondé siempre en español cuando el campo sea texto libre.`,
    model: 'openrouter/deepseek/deepseek-v4-flash',
})
