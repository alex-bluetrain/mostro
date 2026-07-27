import { Agent } from '@mastra/core/agent'
import { z } from 'zod'

// Sin tools y sin memoria: lo único que hace es leer prosa y devolver campos. Toda
// decisión de flujo la toma el poller a partir del step suspendido del run, así que
// el modelo nunca elige qué workflow reanudar ni a quién escribirle.
export const mailExtractorAgent = new Agent({
    id: 'mail-extractor',
    name: 'Mail Extractor',
    description: 'Extrae datos estructurados de los mails que responden los proveedores.',
    instructions: `Sos un extractor de datos. Recibís un mail de un proveedor y una descripción de lo que se está esperando.

Tu única tarea es decidir si el mail es eso que se espera y, si lo es, extraer los campos pedidos.

Reglas:
- No inventes datos. Si un campo no está en el mail, el mail NO coincide.
- Las fechas se devuelven en formato YYYY-MM-DD. Si el mail dice "miércoles 11/03" y no aclara el año, usá el año en curso.
- Si el mail es un aviso general, una publicidad o cualquier cosa que no sea lo esperado, respondé matches: false y explicá por qué en reason.
- reason siempre se completa, tanto si coincide como si no.
- Respondé siempre en español.`,
    model: 'openrouter/deepseek/deepseek-v4-flash',
})

export type ExtractionResult = {
    matches: boolean
    reason: string
    data?: Record<string, unknown>
}

export type ExtractArgs = {
    subject: string
    body: string
    description: string
    schema: z.ZodType
}

export type Extract = (mastra: unknown, args: ExtractArgs) => Promise<ExtractionResult>

type MastraLike = { getAgent: (id: string) => { generate: (prompt: string, options: unknown) => Promise<{ object?: unknown }> } | undefined }

export const extractFromMail: Extract = async (mastra, { subject, body, description, schema }) => {
    const prompt = `Se está esperando: ${description}

Mail recibido
Asunto: ${subject}

${body}`

    // El wrapper deja que el modelo diga que no sin tener que inventar campos para
    // cumplir el schema. matches y reason son siempre obligatorios; data solo cuando
    // coincide.
    const wrapped = z.object({
        matches: z.boolean(),
        reason: z.string(),
        data: schema.optional(),
    })

    try {
        const agent = (mastra as MastraLike | undefined)?.getAgent('mailExtractor')
        if (!agent) {
            return { matches: false, reason: 'el agente mailExtractor no está registrado en mastra' }
        }

        const response = await agent.generate(prompt, {
            structuredOutput: { schema: wrapped, errorStrategy: 'strict' },
        })

        const parsed = wrapped.safeParse(response.object)
        if (!parsed.success) {
            return { matches: false, reason: `los campos de la salida no validaron contra el schema esperado` }
        }

        // matches true sin data válida es una salida incoherente: no se reanuda nada
        // con campos incompletos.
        if (parsed.data.matches && parsed.data.data === undefined) {
            return { matches: false, reason: 'el modelo dijo que coincide pero los campos no validaron' }
        }

        return {
            matches: parsed.data.matches,
            reason: parsed.data.reason,
            data: parsed.data.matches ? (parsed.data.data as Record<string, unknown>) : undefined,
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { matches: false, reason: `falló la extracción: ${detail}` }
    }
}
