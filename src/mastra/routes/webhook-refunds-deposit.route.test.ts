import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/refunds-run', () => ({
  receiveDeposit: vi.fn(),
}))

import { webhookRefundsDepositRoute } from './webhook-refunds-deposit.route'
import { receiveDeposit } from '../lib/refunds-run'

const body = { yearMonth: '2026-07', depositAmount: 15000, depositDate: '2026-07-13' }

// Contexto Hono mínimo: solo lo que usa el handler.
function context() {
  const json = vi.fn((payload: unknown, status?: number) => ({ payload, status: status ?? 200 }))
  return {
    get: () => ({}),
    req: { json: async () => body },
    json,
  }
}

function callHandler(c: any) {
  return (webhookRefundsDepositRoute as any).handler(c)
}

describe('POST /webhooks/refunds/deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when the resumed run does not fail', async () => {
    vi.mocked(receiveDeposit).mockResolvedValue({ ok: true, result: { status: 'success' } } as any)

    const response: any = await callHandler(context())

    expect(response.status).toBe(200)
  })

  it('returns 502 when the resumed run failed', async () => {
    vi.mocked(receiveDeposit).mockResolvedValue({ ok: true, result: { status: 'failed' } } as any)

    const response: any = await callHandler(context())

    expect(response.status).toBe(502)
  })
})
