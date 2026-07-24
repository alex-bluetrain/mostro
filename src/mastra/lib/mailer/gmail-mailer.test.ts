import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { send, setCredentials } = vi.hoisted(() => ({
  send: vi.fn(),
  setCredentials: vi.fn(),
}))

vi.mock('@googleapis/gmail', () => ({
  auth: {
    OAuth2: class {
      setCredentials = setCredentials
    },
  },
  gmail: () => ({ users: { messages: { send } } }),
}))

import { sendEmail } from './gmail-mailer'

const message = { to: 'farmacia@proveedor.test', subject: 'Pedido', text: 'Talle: M' }

// Un error con la forma que devuelve Gaxios (el cliente HTTP de googleapis).
function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { status })
}

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    send.mockResolvedValue({ data: { id: 'msg-1' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends the message as the authenticated account', async () => {
    await sendEmail(message)

    expect(send).toHaveBeenCalledTimes(1)
    const [args] = send.mock.calls[0]
    expect(args.userId).toBe('me')
    const decoded = Buffer.from(args.requestBody.raw, 'base64url').toString('utf8')
    expect(decoded).toContain('To: farmacia@proveedor.test')
    expect(decoded).toContain('Talle: M')
  })

  it('retries transient failures and succeeds', async () => {
    vi.useFakeTimers()
    send.mockRejectedValueOnce(httpError(503))
    send.mockRejectedValueOnce(httpError(429))
    send.mockResolvedValueOnce({ data: { id: 'msg-1' } })

    const pending = sendEmail(message)
    await vi.advanceTimersByTimeAsync(5000)
    await pending

    expect(send).toHaveBeenCalledTimes(3)
  })

  it('retries network failures with no HTTP status and succeeds', async () => {
    vi.useFakeTimers()
    send.mockRejectedValueOnce(Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }))
    send.mockRejectedValueOnce(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }))
    send.mockResolvedValueOnce({ data: { id: 'msg-1' } })

    const pending = sendEmail(message)
    await vi.advanceTimersByTimeAsync(5000)
    await pending

    expect(send).toHaveBeenCalledTimes(3)
  })

  it('gives up after three attempts', async () => {
    vi.useFakeTimers()
    send.mockRejectedValue(httpError(503))

    const pending = sendEmail(message)
    const assertion = expect(pending).rejects.toThrow(/No se pudo enviar el correo/)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion

    expect(send).toHaveBeenCalledTimes(3)
  })

  it('does not retry client errors', async () => {
    send.mockRejectedValue(httpError(403))

    await expect(sendEmail(message)).rejects.toThrow(/No se pudo enviar el correo/)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('explains how to fix a revoked refresh token', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), {
        status: 400,
        response: { data: { error: 'invalid_grant' } },
      }),
    )

    await expect(sendEmail(message)).rejects.toThrow(/pnpm run gmail:auth/)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
