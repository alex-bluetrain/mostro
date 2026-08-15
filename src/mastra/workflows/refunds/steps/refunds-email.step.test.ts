import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@lib/mailer/gmail-mailer', () => ({
  sendEmail: vi.fn(),
}))

import { requestRefundStep } from './request-refund.step'
import { confirmDepositStep } from './confirm-deposit.step'
import { sendEmail } from '@lib/mailer/gmail-mailer'
import { appConfig } from '@config/app.config'

const setState = vi.fn()

function executeRequest() {
  return (requestRefundStep.execute as any)({
    inputData: { amount: 15000, reason: 'Consulta pediátrica', requestedBy: 'Ana' },
    state: { status: 'idle', requestedBy: 'Ana', year: 2026, month: 7 },
    setState,
  })
}

function executeConfirm() {
  return (confirmDepositStep.execute as any)({
    inputData: {},
    state: {
      status: 'deposit_received',
      requestedBy: 'Ana',
      year: 2026,
      month: 7,
      depositAmount: 15000,
      depositDate: 1784000000,
      refundReference: 'REF-123',
    },
    setState,
  })
}

describe('request-refund step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the refund request with amount and reason', async () => {
    await executeRequest()

    expect(sendEmail).toHaveBeenCalledWith({
      to: appConfig.REFUNDS_EMAIL_TO,
      subject: '[Mostro] Solicitud de reintegro 2026-07',
      text: expect.stringContaining('Consulta pediátrica'),
    })
  })

  it('advances the state only after the email went out', async () => {
    await executeRequest()

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refund_requested', amount: 15000 }),
    )
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(executeRequest()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})

describe('confirm-deposit step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
  })

  it('emails the deposit confirmation with its reference', async () => {
    await executeConfirm()

    expect(sendEmail).toHaveBeenCalledWith({
      to: appConfig.REFUNDS_EMAIL_TO,
      subject: '[Mostro] Depósito confirmado 2026-07',
      text: expect.stringContaining('REF-123'),
    })
  })

  it('does not advance the state when the email fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('No se pudo enviar el correo'))

    await expect(executeConfirm()).rejects.toThrow('No se pudo enviar el correo')
    expect(setState).not.toHaveBeenCalled()
  })
})
