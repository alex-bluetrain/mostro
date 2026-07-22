// Keys de los sub-agentes registrados en el supervisor (agents: {...}).
// Vive en un módulo propio porque users.ts la necesita para des-derivar
// resourceIds y no puede importar del supervisor (ciclo: el supervisor importa users).
export const subAgentKeys = ['weatherAgent', 'diapersAgent', 'medsAgent', 'refundsAgent'] as const

export type SubAgentKey = (typeof subAgentKeys)[number]
