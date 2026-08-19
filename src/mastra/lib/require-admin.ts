import { getUserByResourceId } from '@business/identity'
import type { IUser } from '@business/models/user.model'

// El auth provider garantiza que quien llega es un usuario invitado, pero no
// que sea admin: eso se decide acá, con el user real, no con lo que diga el
// cliente. mostro-web usa el rol para esconder las pantallas; la puerta es esta.
export async function requireAdmin(resourceId: unknown): Promise<IUser | null> {
    if (typeof resourceId !== 'string' || !resourceId) return null
    const user = await getUserByResourceId(resourceId)
    return user?.role === 'admin' ? user : null
}
