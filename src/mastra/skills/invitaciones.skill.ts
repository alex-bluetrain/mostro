import { createSkill } from '@mastra/core/skills'

// Instrucciones de invitaciones que antes vivían en el prompt del supervisor.
// La skill sólo se resuelve para admins (ver skills-resolver.ts), así un
// usuario común ni siquiera ve que la capacidad existe.
export const invitacionesSkill = createSkill({
    name: 'invitaciones',
    description:
        'Cómo invitar a una persona nueva al bot y a la web: generar el link de invitación de un solo uso con la tool create-invite. Solo para admins.',
    instructions: `# Invitar usuarios

- Para invitar a alguien solo necesitás el email de Google del invitado (pedilo si falta; nunca pidas su nombre — se toma después de su perfil de Google).
- Buscá y usá la tool \`create-invite\` con ese email, y devolvé el link resultante para que el admin lo reenvíe.
- Si la tool devuelve "only admins can create invites", explicá que solo los admins pueden invitar gente.
- Recordale al admin que mande el link en privado al invitado: quien lo abre se convierte en esa persona.
- El link es de un solo uso y vence en 7 días.`,
})
