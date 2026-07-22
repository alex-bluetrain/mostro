import { userRepository } from './repositories';
import { subAgentKeys } from '../mastra/lib/sub-agent-keys';
import type { IUser } from './models/user.model';

export type ParsedResourceId =
  | { kind: 'telegram'; telegramId: string }
  | { kind: 'email'; email: string };

// Sub-agent delegation derives the child resourceId as `${resourceId}-${agentName}`
// (e.g. 'ana@gmail.com-diapersAgent'); this strips that suffix so it always
// resolves to the parent identity. Only registered keys are stripped: an
// unknown suffix matches no user and the error stays visible instead of
// silently mangled.
function stripSubAgentSuffix(resourceId: string): string {
  for (const key of subAgentKeys) {
    const suffix = `-${key}`;
    if (resourceId.endsWith(suffix)) return resourceId.slice(0, -suffix.length);
  }
  return resourceId;
}

// A resourceId can be 'telegram:<id>' (legacy threads / channel default) or a
// plain email (canonical: new threads and the future web).
export function parseResourceId(resourceId: string): ParsedResourceId | null {
  const base = stripSubAgentSuffix(resourceId);
  const telegramMatch = /^telegram:(.+)$/.exec(base);
  if (telegramMatch) return { kind: 'telegram', telegramId: telegramMatch[1] };
  if (base.includes('@')) return { kind: 'email', email: base.trim().toLowerCase() };
  return null;
}

export async function getUserByResourceId(resourceId: string): Promise<IUser | null> {
  const parsed = parseResourceId(resourceId);
  if (!parsed) return null;
  return parsed.kind === 'telegram'
    ? userRepository.findByTelegramId(parsed.telegramId)
    : userRepository.findByEmail(parsed.email);
}

export async function setUserNameByResourceId(resourceId: string, name: string): Promise<boolean> {
  const parsed = parseResourceId(resourceId);
  if (!parsed) return false;
  if (parsed.kind === 'email') return userRepository.setUserName(parsed.email, name);
  const user = await userRepository.findByTelegramId(parsed.telegramId);
  if (!user) return false;
  return userRepository.setUserName(user.email, name);
}
