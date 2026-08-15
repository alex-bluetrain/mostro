import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { readDiapersStatus } from '@lib/diapers-run'
import { diapersStateSchema } from '@workflows/diapers/schemas/diapers-state.schema'

export const getDiapersStatusTool = createTool({
    id: 'get-diapers-status',
    description: 'Consulta el estado actual y compartido del pedido de pañales (mismo estado para todos los usuarios). El pedido está scopeado por mes: indicá siempre mes y año.',
    inputSchema: z.object({
        month: z.number().int().min(1).max(12).describe('Mes del pedido (1-12). Usá el mes actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
        year: z.number().int().min(2020).max(2100).describe('Año del pedido. Usá el año actual indicado en tus instrucciones salvo que el usuario nombre otro.'),
    }),
    outputSchema: diapersStateSchema.nullable(),
    mcp: {
        annotations: { readOnlyHint: true, idempotentHint: true },
    },
    execute: async (input, context) => {
        if (!context?.mastra) {
            throw new Error('mastra instance not available in tool context')
        }
        return readDiapersStatus(context.mastra as any, input.year, input.month)
    },
})
