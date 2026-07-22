import { userRepository } from '../../business/repositories'

export type GoogleAuthGateDeps = {
    findByEmail: (email: string) => Promise<{ name: string } | null>
    setUserName: (email: string, name: string) => Promise<boolean>
}

const defaultDeps: GoogleAuthGateDeps = {
    findByEmail: email => userRepository.findByEmail(email),
    setUserName: (email, name) => userRepository.setUserName(email, name),
}

// El SSO de @mastra/auth-google emite la cookie de sesión sin consultar
// authorizeUser, así que el allowlist se aplica acá, antes de que exista la
// sesión. De paso completa el nombre desde el perfil de Google la primera vez;
// nunca pisa un nombre ya elegido (p. ej. vía set-my-name-tool).
export async function assertInvitedAndSyncName(
    user: { email?: string; emailVerified?: boolean; name?: string },
    deps: GoogleAuthGateDeps = defaultDeps,
): Promise<void> {
    if (!user.email || user.emailVerified === false) {
        throw new Error('google account has no verified email')
    }
    const known = await deps.findByEmail(user.email)
    if (!known) {
        throw new Error(`no user for ${user.email}: access is invite-only`)
    }
    if (!known.name && user.name) {
        await deps.setUserName(user.email, user.name)
    }
}
