import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@business/identity', () => ({
  getUserByResourceId: vi.fn(),
}))
vi.mock('@lib/diapers-run', () => ({
  startDiapers: vi.fn(),
}))

import { requestDiapersTool } from './diapers-request-tool'
import { getUserByResourceId } from '@business/identity'
import { startDiapers } from '@lib/diapers-run'

const ctx = { mastra: {}, agent: { resourceId: 'ana@gmail.com' } }
function run(input: any, context: any = ctx) {
  return (requestDiapersTool.execute as any)(input, context)
}

describe('requestDiapersTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(startDiapers).mockResolvedValue({ alreadyInProgress: false, result: {} } as any)
  })

  it('rejects with requester_unidentified when the user has an empty name', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: '', role: 'member', addedAt: 1 } as any)
    const result = await run({ size: 'M' })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startDiapers).not.toHaveBeenCalled()
  })

  it('rejects with requester_unidentified when the user cannot be resolved', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue(null)
    const result = await run({ size: 'M' })
    expect(result).toMatchObject({ ok: false, reason: 'requester_unidentified' })
    expect(startDiapers).not.toHaveBeenCalled()
  })

  it('starts the order with the resolved name as requestedBy', async () => {
    vi.mocked(getUserByResourceId).mockResolvedValue({ email: 'ana@gmail.com', name: 'Ana', role: 'member', addedAt: 1 } as any)
    await run({ size: 'M' })
    expect(startDiapers).toHaveBeenCalledWith({}, { size: 'M', requestedBy: 'Ana' })
  })
})
