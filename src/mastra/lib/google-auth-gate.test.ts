import { describe, it, expect, vi } from 'vitest';
import { assertInvitedAndSyncName, type GoogleAuthGateDeps } from './google-auth-gate';

function makeDeps(overrides: Partial<GoogleAuthGateDeps> = {}): GoogleAuthGateDeps {
  return {
    findByEmail: vi.fn().mockResolvedValue({ name: 'Ana' }),
    setUserName: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('assertInvitedAndSyncName', () => {
  it('rejects users without a verified email', async () => {
    const deps = makeDeps();
    await expect(assertInvitedAndSyncName({}, deps)).rejects.toThrow();
    await expect(
      assertInvitedAndSyncName({ email: 'x@gmail.com', emailVerified: false }, deps)
    ).rejects.toThrow();
    expect(deps.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects emails that are not in the users collection', async () => {
    const deps = makeDeps({ findByEmail: vi.fn().mockResolvedValue(null) });
    await expect(
      assertInvitedAndSyncName({ email: 'stranger@gmail.com', name: 'S' }, deps)
    ).rejects.toThrow(/invite/);
    expect(deps.setUserName).not.toHaveBeenCalled();
  });

  it('fills an empty name from the google profile', async () => {
    const deps = makeDeps({ findByEmail: vi.fn().mockResolvedValue({ name: '' }) });
    await assertInvitedAndSyncName({ email: 'new@gmail.com', name: 'Nueva Persona' }, deps);
    expect(deps.setUserName).toHaveBeenCalledWith('new@gmail.com', 'Nueva Persona');
  });

  it('never overwrites an existing name', async () => {
    const deps = makeDeps();
    await assertInvitedAndSyncName({ email: 'ana@gmail.com', name: 'Otro Nombre' }, deps);
    expect(deps.setUserName).not.toHaveBeenCalled();
  });
});
