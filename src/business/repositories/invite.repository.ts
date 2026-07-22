import { Invite, type IInvite } from '../models/invite.model';
import { nowUnix } from '../../mastra/lib/unix-time';

export class InviteRepository {
  async create(email: string, createdBy: string): Promise<IInvite> {
    const result = await Invite.create({
      email: email.toLowerCase(),
      createdBy: createdBy.toLowerCase(),
      createdAt: nowUnix(),
    });
    return result.toObject() as IInvite;
  }

  async findByEmail(email: string): Promise<IInvite | null> {
    return Invite.findOne({ email: email.toLowerCase() });
  }

  async markAsUsed(email: string, usedBy: string): Promise<boolean> {
    const result = await Invite.updateOne(
      { email: email.toLowerCase() },
      { $set: { usedAt: nowUnix(), usedBy: usedBy.toLowerCase() } }
    );
    return result.matchedCount > 0;
  }

  async listPending(): Promise<IInvite[]> {
    return Invite.find({ usedAt: { $exists: false } });
  }
}

export const inviteRepository = new InviteRepository();
