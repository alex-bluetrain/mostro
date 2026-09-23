import { registerApiRoute } from '@mastra/core/server'
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context'
import { getUserByResourceId } from '@business/identity'

// Who am I, according to Mostro. mostro-app has no way to know a user's role
// (its only identity is the email Google verified), so it asks here and stores
// it in the session.
//
// No need to check the invitation: the auth provider already rejected anyone not
// in users before reaching the handler. The email comes from the resourceId the
// token signature resolved, never from the body or the query.
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
