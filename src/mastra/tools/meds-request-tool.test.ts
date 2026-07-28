import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@business/identity', () => ({
  getUserByResourceId: vi.fn(),
}))
vi.mock('@lib/meds-run', () => ({
  startMedsOrder: vi.fn(),
}))

import { requestMedsTool } from './meds-request-tool'
import { getUserByResourceId } from '@business/identity'
import { startMedsOrder } from '@lib/meds-run'

const ctx = { mastra: {}, agent: { resourceId: 'ana@gmail.com' } }
function run(input: any, context: any = ctx) {
  return (requestMedsTool.execute as any)(input, context)
}

describe('requestMedsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(startMedsOrder).mockResolvedValue({ alreadyInProgress: false, result: {} } as any)
  })

  it('rejects with requester_unidentified when the user has an empty name', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: '', role: 'member', addedAt: 1 } as any)
    const result = await run({ medications: ['ibuprofeno'] })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startMedsOrder).not.toHaveBeenCalled()
  })

  it('rejects with requester_unidentified when the user cannot be resolved', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue(null)
    const result = await run({ medications: ['ibuprofeno'] })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startMedsOrder).not.toHaveBeenCalled()
  })

  it('starts the order with the resolved name as requestedBy', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: 'Ana', role: 'member', addedAt: 1 } as any)
    await run({ medications: ['ibuprofeno'] })
    expect(startMedsOrder).toHaveBeenCalledWith({}, { medications: ['ibuprofeno'], requestedBy: 'Ana' })
  })
})
