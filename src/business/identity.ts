import { userRepository } from './repositories';
import { subAgentKeys } from '../mastra/lib/sub-agent-keys';
import type { IUser } from './models/user.model';

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

// Todo resourceId canónico es el email del usuario (resolveResourceId lo
// garantiza al crear threads). Un id sin '@' no es un email: devuelve null y
// las tools lo reportan como usuario desconocido.
export function emailFromResourceId(resourceId: string): string | null {
  const base = stripSubAgentSuffix(resourceId).trim().toLowerCase();
  return base.includes('@') ? base : null;
}

export async function getUserByResourceId(resourceId: string): Promise<IUser | null> {
  const email = emailFromResourceId(resourceId);
  if (!email) return null;
  return userRepository.findByEmail(email);
}

export async function setUserNameByResourceId(resourceId: string, name: string): Promise<boolean> {
  const email = emailFromResourceId(resourceId);
  if (!email) return false;
  return userRepository.setUserName(email, name);
}
