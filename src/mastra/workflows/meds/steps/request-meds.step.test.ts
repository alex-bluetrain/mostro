import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@lib/mailer/gmail-mailer', () => ({
  sendEmail: vi.fn(),
}))

import { requestMedsStep } from './request-meds.step'
import { sendEmail } from '@lib/mailer/gmail-mailer'

const setState = vi.fn()

function execute() {
  return (requestMedsStep.execute as any)({
    inputData: { medications: ['Ibuprofeno 400mg'], requestedBy: 'Ana' },
    state: { status: 'idle', requestedBy: 'Ana' },
    setState,
    runId: 'meds-2026-07',
  })
}

describe('request-meds step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the pharmacy with the medication list', async () => {
    await execute()

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'farmacia@proveedor.test',
      subject: '[Mostro] Pedido de medicamentos 2026-07',
      text: expect.stringContaining('- Ibuprofeno 400mg'),
    })
  })

  it('advances the state only after the email went out', async () => {
    await execute()

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'meds_requested', requestedBy: 'Ana' }),
    )
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(execute()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})
