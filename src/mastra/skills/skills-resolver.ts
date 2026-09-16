import type { AgentSkillsResolver, SkillInput } from '@mastra/core/skills'
import { isRequestAdmin } from '@lib/request-identity'
import { invitacionesSkill } from './invitaciones.skill'
import { weatherSkill } from './weather.skill'
import { diapersSkill } from './diapers.skill'
import { medsSkill } from './meds.skill'
import { refundsSkill } from './refunds.skill'

// Resolver dinámico de skills del supervisor. Corre una vez por
// RequestContext, pero también en lecturas de metadata (listSkills, endpoints
// del server) donde no hay span de tracing ni identidad: en ese caso
// isRequestAdmin devuelve false y las skills gateadas simplemente no aparecen.
export const supervisorSkillsResolver: AgentSkillsResolver = async ({ requestContext }) => {
    const skills: SkillInput[] = [weatherSkill, diapersSkill, medsSkill, refundsSkill]
    if (await isRequestAdmin(requestContext)) skills.push(invitacionesSkill)
    return skills
}
