import { randomBytes } from 'node:crypto';
import { Invite, type IInvite } from '../models/invite.model';
import { nowUnix } from '../../mastra/lib/unix-time';

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export function generateInviteCode(): string {
  return randomBytes(9).toString('base64url');
}

export class InviteRepository {
  // Creates only the invite document: the user is provisioned at redeem time
  // (telegram /start), never at invite time.
  async create(params: { createdBy: string; email: string }): Promise<IInvite> {
    const email = params.email.trim().toLowerCase();
    const now = nowUnix();
    const invite = await Invite.create({
      code: generateInviteCode(),
      email,
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
