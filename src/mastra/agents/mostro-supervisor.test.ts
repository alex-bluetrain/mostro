import { describe, expect, it } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { MOSTRO_SUPERVISOR_INSTRUCTIONS, supervisorInstructions } from './mostro-supervisor'
import { CHANNEL_KEY } from '@lib/web-thread'

function contextFor(channel?: string) {
    const requestContext = new RequestContext()
    if (channel) requestContext.set(CHANNEL_KEY, channel)
    return { requestContext }
}

describe('supervisorInstructions', () => {
    // El prompt de OpenUI exige que toda la respuesta sea openui-lang. Si se
    // filtra a Telegram, el bot deja de mandar texto y queda inutilizable: este
    // test es la red que evita esa regresión.
    it('deja las instrucciones de Telegram intactas', () => {
        expect(supervisorInstructions(contextFor())).toBe(MOSTRO_SUPERVISOR_INSTRUCTIONS)
    })

    it('no filtra openui-lang a canales que no son web', () => {
        expect(supervisorInstructions(contextFor('telegram'))).not.toMatch(/openui-lang/)
    })

    it('agrega el prompt de OpenUI en web', () => {
        const instructions = supervisorInstructions(contextFor('web'))

        expect(instructions).toMatch(/openui-lang/)
        expect(instructions).toContain('Channel: web (OpenUI)')
    })

    it('conserva las reglas de negocio en web', () => {
        const instructions = supervisorInstructions(contextFor('web'))

        // El formato cambia, la conducta no: delegación y tono siguen valiendo.
        expect(instructions).toContain(MOSTRO_SUPERVISOR_INSTRUCTIONS)
    })
})
