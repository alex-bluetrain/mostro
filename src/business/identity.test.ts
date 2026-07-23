import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./repositories', () => ({
  userRepository: { findByEmail: vi.fn(), setUserName: vi.fn() },
}));

import { emailFromResourceId, getUserByResourceId, setUserNameByResourceId } from './identity';
import { userRepository } from './repositories';

const user = { email: 'ana@gmail.com', name: 'Ana', role: 'member' as const, addedAt: 1 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('emailFromResourceId', () => {
  it('returns a plain email trimmed and lowercased', () => {
    expect(emailFromResourceId(' Ana@Gmail.com ')).toBe('ana@gmail.com');
  });

  it('strips a registered sub-agent suffix', () => {
    expect(emailFromResourceId('ana@gmail.com-diapersAgent')).toBe('ana@gmail.com');
  });

  it('does not strip unknown suffixes', () => {
    expect(emailFromResourceId('ana@gmail.com-notAnAgent')).toBe('ana@gmail.com-notanagent');
  });

  it('returns null for non-email ids', () => {
    expect(emailFromResourceId('telegram:12345')).toBeNull();
  });
});

describe('getUserByResourceId', () => {
  it('looks up by email', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(user as any);
    const result = await getUserByResourceId('ana@gmail.com-diapersAgent');
    expect(userRepository.findByEmail).toHaveBeenCalledWith('ana@gmail.com');
    expect(result).toEqual(user);
  });

  it('returns null for non-email ids without hitting the repo', async () => {
    const result = await getUserByResourceId('telegram:12345');
    expect(result).toBeNull();
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });
});

describe('setUserNameByResourceId', () => {
  it('sets the name by email', async () => {
    vi.mocked(userRepository.setUserName).mockResolvedValue(true);
    const ok = await setUserNameByResourceId('ana@gmail.com-diapersAgent', 'Ana');
    expect(userRepository.setUserName).toHaveBeenCalledWith('ana@gmail.com', 'Ana');
    expect(ok).toBe(true);
  });

  it('returns false for non-email ids without hitting the repo', async () => {
    const ok = await setUserNameByResourceId('telegram:12345', 'Ana');
    expect(ok).toBe(false);
    expect(userRepository.setUserName).not.toHaveBeenCalled();
  });
});
