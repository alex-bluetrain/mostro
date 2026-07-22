import { describe, it, expect, beforeEach, vi } from 'vitest';

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock('@composio/core', () => ({
  Composio: vi.fn(function(this: any) {
    this.tools = { execute: executeMock };
  }),
}));

vi.mock('../config/app.config', () => ({
  appConfig: { COMPOSIO_API_KEY: 'test-key', COMPOSIO_USER_ID: 'default' },
}));

import { buildInviteEmail, sendInviteEmail } from './invite-email';

describe('buildInviteEmail', () => {
  it('includes the telegram link and the expiry warning', () => {
    const { subject, body } = buildInviteEmail({ to: 'x@gmail.com', link: 'https://t.me/bot?start=abc' });
    expect(subject.length).toBeGreaterThan(0);
    expect(body).toContain('https://t.me/bot?start=abc');
    expect(body).toContain('7 días');
  });
});

describe('sendInviteEmail', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('executes GMAIL_SEND_EMAIL with the recipient and returns ok', async () => {
    executeMock.mockResolvedValue({ successful: true });

    const result = await sendInviteEmail({ to: 'x@gmail.com', link: 'https://t.me/bot?start=abc' });

    expect(result.ok).toBe(true);
    expect(executeMock).toHaveBeenCalledWith(
      'GMAIL_SEND_EMAIL',
      expect.objectContaining({
        userId: 'default',
        arguments: expect.objectContaining({ recipient_email: 'x@gmail.com' }),
      })
    );
  });

  it('reports failure when composio says unsuccessful or throws', async () => {
    executeMock.mockResolvedValue({ successful: false, error: 'quota' });
    expect((await sendInviteEmail({ to: 'x@gmail.com', link: 'l' })).ok).toBe(false);

    executeMock.mockRejectedValue(new Error('network down'));
    const result = await sendInviteEmail({ to: 'x@gmail.com', link: 'l' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network down');
  });
});
