import type { Mastra } from '@mastra/core/mastra'

export type HandleContext = {
    mastra: Mastra
    text: string
    yearMonth: string
    data: unknown
}

export type HandleResult = { ok: true } | { ok: false; reason: string }

// Adapta el {ok, reason?} que devuelven los helpers *-run.ts al HandleResult que espera el
// step, descartando campos internos (status, suspendedStep, etc) que no le importan acá.
export function toHandleResult(result: { ok: boolean; reason?: string }): HandleResult {
    return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? 'unknown' }
}

export type OutcomeHandlers = Record<string, (ctx: HandleContext) => Promise<HandleResult>>

// Ejecuta el side effect asociado a un label de clasificación. Label sin handler
// registrado = outcome sin side effects, se considera completado.
export async function processOutcome(handlers: OutcomeHandlers, label: string, ctx: HandleContext): Promise<HandleResult> {
    const handler = handlers[label]
    if (!handler) return { ok: true }
    return handler(ctx)
}
