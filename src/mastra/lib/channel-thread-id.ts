// Convención única de ids de thread: `<email>:<canal>`.
//
// El email ya es el resourceId canónico (ver resolve-resource-id.ts), así que
// derivar el thread de él deja un id computable desde cualquier lado: no hace
// falta buscar el thread por metadata para saber a dónde entregar algo.
//
// Un thread por canal, no uno global: la conversación de Telegram y la de la
// web quedan separadas, pero comparten resourceId, así que la memoria de
// recurso (quién es el usuario, qué pidió) sigue siendo común a ambas.
export type ThreadChannel = 'telegram' | 'web'

export function channelThreadId(email: string, channel: ThreadChannel): string {
    return `${email}:${channel}`
}
