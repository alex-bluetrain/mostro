import { describe, it, expect } from 'vitest'
import { diapersRequestEmail } from './diapers'
import { medsRequestEmail } from './meds'
import { refundRequestEmail, depositConfirmedEmail } from './refunds'

describe('diapersRequestEmail', () => {
  it('states the size, the requester and the scoped month', () => {
    const { subject, text } = diapersRequestEmail({ size: 'M', requestedBy: 'Ana', year: 2026, month: 7 })
    expect(subject).toBe('Pedido de pañales 2026-07')
    expect(text).toContain('Talle: M')
    expect(text).toContain('Ana')
  })
})

describe('medsRequestEmail', () => {
  it('lists every medication', () => {
    const { subject, text } = medsRequestEmail({
      medications: ['Ibuprofeno 400mg', 'Amoxicilina 500mg'],
      requestedBy: 'Ana',
      year: 2026,
      month: 7,
    })
    expect(subject).toBe('[Mostro] Pedido de medicamentos 2026-07')
    expect(text).toContain('- Ibuprofeno 400mg')
    expect(text).toContain('- Amoxicilina 500mg')
  })
})

describe('refundRequestEmail', () => {
  it('states the amount and the reason', () => {
    const { subject, text } = refundRequestEmail({
      amount: 15000,
      reason: 'Consulta pediátrica',
      requestedBy: 'Ana',
      year: 2026,
      month: 7,
    })
    expect(subject).toBe('[Mostro] Solicitud de reintegro 2026-07')
    expect(text).toContain('15000')
    expect(text).toContain('Consulta pediátrica')
  })

  it('omits the reason line when there is no reason', () => {
    const { text } = refundRequestEmail({ amount: 15000, requestedBy: 'Ana', year: 2026, month: 7 })
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('Motivo:')
  })
})

describe('depositConfirmedEmail', () => {
  it('states the deposited amount and its date as YYYY-MM-DD', () => {
    const { subject, text } = depositConfirmedEmail({
      depositAmount: 15000,
      depositDate: 1784000000,
      refundReference: 'REF-123',
      year: 2026,
      month: 7,
    })
    expect(subject).toBe('[Mostro] Depósito confirmado 2026-07')
    expect(text).toContain('15000')
    expect(text).toContain('2026-07-14')
    expect(text).toContain('REF-123')
  })

  it('omits missing optional fields instead of printing undefined', () => {
    const { text } = depositConfirmedEmail({ year: 2026, month: 7 })
    expect(text).not.toContain('undefined')
  })
})
