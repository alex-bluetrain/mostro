import { describe, it, expect, vi } from 'vitest';
import {
  createTelegramStartHandler,
  buildWelcomeMessage,
  KNOWN_USER_GREETING,
  INVALID_INVITE_MESSAGE,
  type TelegramStartDeps,
} from './telegram-start';
import type { IInvite, IUser } from '../../business';

const invite: IInvite = {
  code: 'abc123',
  email: 'new@gmail.com',
  createdBy: 'admin@gmail.com',
  createdAt: 1000,
  expiresAt: 2000,
};

const newUser: IUser = { email: 'new@gmail.com', name: '', role: 'member', telegramId: '42', addedAt: 1500 };

function makeDeps(overrides: Partial<TelegramStartDeps> = {}): TelegramStartDeps {
  return {
    getUserByTelegramId: vi.fn().mockResolvedValue(null),
    redeemInvite: vi.fn().mockResolvedValue(invite),
    provisionUser: vi.fn().mockResolvedValue(newUser),
    ...overrides,
  };
}

function makeEvent(text: string) {
  return { user: { userId: '42' }, text, channel: { post: vi.fn().mockResolvedValue(undefined) } };
}

describe('createTelegramStartHandler', () => {
  it('greets known users without redeeming anything', async () => {
    const deps = makeDeps({ getUserByTelegramId: vi.fn().mockResolvedValue(newUser) });
    const event = makeEvent('abc123');

    await createTelegramStartHandler(deps)(event);

    expect(event.channel.post).toHaveBeenCalledWith(KNOWN_USER_GREETING);
    expect(deps.redeemInvite).not.toHaveBeenCalled();
  });

  it('rejects when there is no code or the code is invalid', async () => {
    const deps = makeDeps({ redeemInvite: vi.fn().mockResolvedValue(null) });

    const noCode = makeEvent('   ');
    await createTelegramStartHandler(deps)(noCode);
    expect(noCode.channel.post).toHaveBeenCalledWith(INVALID_INVITE_MESSAGE);

    const badCode = makeEvent('nope');
    await createTelegramStartHandler(deps)(badCode);
    expect(badCode.channel.post).toHaveBeenCalledWith(INVALID_INVITE_MESSAGE);
  });

  it('provisions the user on a valid redeem and welcomes asking for the name', async () => {
    const deps = makeDeps();
    const event = makeEvent('abc123');

    await createTelegramStartHandler(deps)(event);

    expect(deps.provisionUser).toHaveBeenCalledWith('new@gmail.com', '42');
    expect(event.channel.post).toHaveBeenCalledWith(buildWelcomeMessage(undefined));
  });

  it('uses the legacy invite name in the welcome when present', async () => {
    const deps = makeDeps({ redeemInvite: vi.fn().mockResolvedValue({ ...invite, name: 'Ana' }) });
    const event = makeEvent('abc123');

    await createTelegramStartHandler(deps)(event);

    expect(event.channel.post).toHaveBeenCalledWith(buildWelcomeMessage('Ana'));
  });
});
