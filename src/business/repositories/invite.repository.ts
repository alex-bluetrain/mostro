import { randomBytes } from 'node:crypto';
import { Invite, type IInvite } from '../models/invite.model';
import { nowUnix } from '../../mastra/lib/unix-time';
import { userRepository } from './user.repository';

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export function generateInviteCode(): string {
  return randomBytes(9).toString('base64url');
}

export class InviteRepository {
  // Creates the invite and ensures the invitee's user record exists (without
  // telegram yet) so they can already log into the web before redeeming.
  async create(params: { createdBy: string; email: string; name?: string }): Promise<IInvite> {
    const email = params.email.trim().toLowerCase();
    const now = nowUnix();
    await userRepository.upsertUser({ email, name: params.name ?? '', role: 'member', addedAt: now });
    const invite = await Invite.create({
      code: generateInviteCode(),
      email,
      ...(params.name ? { name: params.name } : {}),
      createdBy: params.createdBy,
      createdAt: now,
      expiresAt: now + INVITE_TTL_SECONDS,
    });
    return invite.toObject() as IInvite;
  }

  // Atomic redeem: matches only unused, unexpired invites and marks them used
  // in the same operation (of two concurrent redemptions, one wins, the other gets null).
  async redeem(code: string, telegramId: string): Promise<IInvite | null> {
    return Invite.findOneAndUpdate(
      { code, usedBy: { $exists: false }, expiresAt: { $gt: nowUnix() } },
      { $set: { usedBy: telegramId } },
      { new: true }
    );
  }
}

export const inviteRepository = new InviteRepository();
