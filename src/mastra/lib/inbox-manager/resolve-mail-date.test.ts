import { describe, it, expect } from 'vitest'
import { resolveMailDate } from './resolve-mail-date'

describe('resolveMailDate', () => {
    it('takes the oldest X-Received header as the send date', () => {
        const headers = [
            { name: 'X-Received', value: 'by 2002:a05; Sat, 01 Aug 2026 10:00:00 -0700 (PDT)' },
            { name: 'X-Received', value: 'by 2002:a06; Thu, 30 Jul 2026 08:12:33 -0700 (PDT)' },
        ]

        expect(resolveMailDate(headers, new Date('2026-08-02T12:00:00Z')).toISOString())
            .toBe(new Date('Thu, 30 Jul 2026 08:12:33 -0700').toISOString())
    })

    it('ignores headers whose date cannot be parsed', () => {
        const headers = [
            { name: 'X-Received', value: 'by 2002:a05; not a date' },
            { name: 'X-Received', value: 'by 2002:a06; Thu, 30 Jul 2026 08:12:33 -0700 (PDT)' },
        ]

        expect(resolveMailDate(headers, new Date('2026-08-02T12:00:00Z')).toISOString())
            .toBe(new Date('Thu, 30 Jul 2026 08:12:33 -0700').toISOString())
    })

    it('falls back to the given date when there is no usable header', () => {
        const fallback = new Date('2026-08-02T12:00:00Z')

        expect(resolveMailDate([], fallback)).toBe(fallback)
        expect(resolveMailDate(undefined, fallback)).toBe(fallback)
        expect(resolveMailDate([{ name: 'X-Received', value: 'by 2002:a05; nope' }], fallback)).toBe(fallback)
    })
})
