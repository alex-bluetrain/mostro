import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'

const { isRequestAdminMock } = vi.hoisted(() => ({ isRequestAdminMock: vi.fn() }))

vi.mock('@lib/request-identity', () => ({ isRequestAdmin: isRequestAdminMock }))

import { supervisorSkillsResolver } from './skills-resolver'
import { invitacionesSkill } from './invitaciones.skill'
import { weatherSkill } from './weather.skill'

beforeEach(() => {
    isRequestAdminMock.mockReset()
})

describe('supervisorSkillsResolver', () => {
    it('expone invitaciones solo a admins (más las skills comunes)', async () => {
        isRequestAdminMock.mockResolvedValue(true)

        const skills = await supervisorSkillsResolver({ requestContext: new RequestContext() })

        expect(skills).toContain(invitacionesSkill)
        expect(skills).toContain(weatherSkill)
    })

    it('oculta las skills gateadas a no-admins (y a lecturas de metadata sin identidad)', async () => {
        isRequestAdminMock.mockResolvedValue(false)

        const skills = await supervisorSkillsResolver({ requestContext: new RequestContext() })

        expect(skills).not.toContain(invitacionesSkill)
        expect(skills).toContain(weatherSkill)
    })
})
