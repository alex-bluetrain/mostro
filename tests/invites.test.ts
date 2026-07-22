import { describe, expect, it } from 'vitest'
import { generateInviteCode } from '../src/business/repositories/invite.repository'

describe('generateInviteCode', () => {
    it('genera códigos URL-safe (aptos para t.me/bot?start=CODE)', () => {
        for (let i = 0; i < 50; i++) {
            expect(generateInviteCode()).toMatch(/^[A-Za-z0-9_-]{12}$/)
        }
    })

    it('no repite códigos', () => {
        const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
        expect(codes.size).toBe(100)
    })
})
