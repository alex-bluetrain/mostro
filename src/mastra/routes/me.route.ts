import { registerApiRoute } from '@mastra/core/server'
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'
import { getUserByResourceId } from '@business/identity'

// Quién soy, según Mostro. mostro-web no tiene forma de saber el rol de un
// usuario (su única identidad es el email que Google le verificó), así que lo
// pregunta acá y lo guarda en la sesión.
//
// No hace falta chequear invitación: el auth provider ya rechazó a cualquiera
// que no exista en users antes de llegar al handler. El email sale del
// resourceId que resolvió la firma del JWT, nunca del body ni del query.
export const meRoute = registerApiRoute('/users/me', {
    method: 'GET',
    handler: async c => {
        const resourceId = c.get('requestContext')?.get(MASTRA_RESOURCE_ID_KEY)
        if (typeof resourceId !== 'string' || !resourceId) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const user = await getUserByResourceId(resourceId)
        if (!user) {
            return c.json({ error: 'Not found' }, 404)
        }

        return c.json({
            email: user.email,
            name: user.name,
            role: user.role,
            preferences: { notifications: user.preferences?.notifications ?? false },
        })
    },
})
