import { User, type IUser } from '../models/user.model';
import { nowUnix } from '../../mastra/lib/unix-time';

export class UserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findByTelegramId(telegramId: string): Promise<IUser | null> {
    return User.findOne({ telegramId });
  }

  async upsertUser(user: Omit<IUser, 'telegramId'>): Promise<IUser> {
    const email = user.email.toLowerCase();
    const result = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { ...user, email, addedAt: nowUnix() } },
      { upsert: true, new: true }
    );
    if (!result) throw new Error('Failed to upsert user');
    return result;
  }

  async linkTelegramId(email: string, telegramId: string): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { telegramId } }
    );
    return result.matchedCount > 0;
  }

  // Redeem-time provisioning: creates the user on their first /start, or just
  // links telegram when the email already exists (legacy users, admin seed).
  async upsertFromInviteRedeem(email: string, telegramId: string): Promise<IUser> {
    const normalized = email.toLowerCase();
    const result = await User.findOneAndUpdate(
      { email: normalized },
      {
        $setOnInsert: {
          email: normalized,
          name: '',
          role: 'member' as const,
          addedAt: nowUnix(),
        },
        $set: { telegramId },
      },
      { upsert: true, new: true }
    );
    if (!result) throw new Error('Failed to upsert user from invite redeem');
    return result;
  }

  async setUserName(email: string, name: string): Promise<boolean> {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { name } }
    );
    return result.matchedCount > 0;
  }

  async ensureAdminSeed(adminEmail: string, adminName: string, adminTelegramId?: string): Promise<void> {
    const email = adminEmail.toLowerCase();
    await User.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          name: adminName,
          role: 'admin' as const,
          addedAt: nowUnix(),
        },
        ...(adminTelegramId ? { $set: { telegramId: adminTelegramId } } : {}),
      },
      { upsert: true }
    );
  }
}

export const userRepository = new UserRepository();
