import { z } from 'zod'

// Fechas del state de los workflows: unix timestamp en segundos.
export const unixTimestampSchema = z.number().int().describe('Unix timestamp en segundos')

export function nowUnix(): number {
    return Math.floor(Date.now() / 1000)
}

// Convierte una fecha en string (ISO o YYYY-MM-DD) a unix timestamp en segundos.
export function toUnix(date: string): number {
    return Math.floor(new Date(date).getTime() / 1000)
}

// YYYY-MM-DD legible para avisos a usuarios.
export function formatUnixDate(ts: number): string {
    return new Date(ts * 1000).toISOString().slice(0, 10)
}
