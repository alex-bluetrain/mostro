import { getUserByResourceId } from '@business/identity'
import type { IUser } from '@business/models/user.model'

// The auth provider guarantees the caller is an invited user, but not that they
// are an admin: that is decided here, with the real user, not with whatever the
// client claims. mostro-app uses the role to hide screens; this is the gate.
export async function requireAdmin(resourceId: unknown): Promise<IUser | null> {
    if (typeof resourceId !== 'string' || !resourceId) return null
    const user = await getUserByResourceId(resourceId)
    return user?.role === 'admin' ? user : null
}
