import { appConfig } from '@config/app.config'
import { inviteRepository, userRepository } from '@business/repositories'
import type { IInvite } from '@business'

export type CreateInviteResult =
    | { ok: true; link: string; expiresAt: number }
    | { ok: false; error: string }

export function inviteLink(code: string): string {
    return `https://t.me/${appConfig.TELEGRAM_BOT_USERNAME}?start=${code}`
}

// Invitar es lo mismo se pida por chat o desde la pantalla de admin, así que la
// regla vive acá y no en cada entrada: el caller ya autenticado sólo dice quién
// es. Un email con telegramId ya redimió su invitación; volver a invitarlo sólo
// genera un link que no sirve.
export async function createInvite(caller: { email: string; role: string }, email: string): Promise<CreateInviteResult> {
    if (caller.role !== 'admin') {
        return { ok: false, error: 'only admins can create invites' }
    }

    const existing = await userRepository.findByEmail(email)
    if (existing?.telegramId) {
        return { ok: false, error: 'that email already belongs to an active user' }
    }

    const invite = await inviteRepository.create({ createdBy: caller.email, email })
    return { ok: true, link: inviteLink(invite.code), expiresAt: invite.expiresAt }
}

export type InviteStatus = 'used' | 'expired' | 'pending'

export function inviteStatus(invite: IInvite, now: number): InviteStatus {
    if (invite.usedBy) return 'used'
    return invite.expiresAt <= now ? 'expired' : 'pending'
}
