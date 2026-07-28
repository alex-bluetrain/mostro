import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@lib/mailer/gmail-mailer', () => ({
  sendEmail: vi.fn(),
}))

import { requestDiapers } from './request-diapers.step'
import { sendEmail } from '@lib/mailer/gmail-mailer'

const setState = vi.fn()

function execute() {
  return (requestDiapers.execute as any)({
    inputData: { size: 'M', requestedBy: 'Ana' },
    state: { status: 'idle', requestedBy: 'Ana' },
    setState,
    runId: 'diapers-2026-07',
  })
}

describe('request-diapers step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the supplier with the size and the scoped month', async () => {
    await execute()

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'panales@proveedor.test',
      subject: '[Mostro] Pedido de pañales 2026-07',
      text: expect.stringContaining('Talle: M'),
    })
  })

  it('advances the state only after the email went out', async () => {
    await execute()

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'diapers_requested', size: 'M', requestedBy: 'Ana' }),
    )
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(execute()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})
