import { userRepository } from './repositories';
import type { IUser } from './models/user.model';

// Todo resourceId canónico es el email del usuario (resolveResourceId lo
// garantiza al crear threads). Un id sin '@' no es un email: devuelve null y
// las tools lo reportan como usuario desconocido.
export function emailFromResourceId(resourceId: string): string | null {
  const base = resourceId.trim().toLowerCase();
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
