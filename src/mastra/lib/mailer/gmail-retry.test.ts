import { describe, it, expect, afterEach, vi } from 'vitest'
import { GMAIL_TIMEOUT_MS, isInvalidGrant, isRetryable, withGmailRetry } from './gmail-retry'

function httpError(status: number) {
    return Object.assign(new Error(`Request failed with status code ${status}`), { status })
}

describe('GMAIL_TIMEOUT_MS', () => {
    it('es 15 segundos', () => {
        expect(GMAIL_TIMEOUT_MS).toBe(15000)
    })
})

describe('isRetryable', () => {
    it('trata un error sin status como retriable (red/timeout)', () => {
        expect(isRetryable(new Error('ECONNRESET'))).toBe(true)
    })

    it('trata 429 y 5xx como retriables', () => {
        expect(isRetryable(httpError(429))).toBe(true)
        expect(isRetryable(httpError(503))).toBe(true)
    })

    it('trata otros 4xx como no retriables', () => {
        expect(isRetryable(httpError(403))).toBe(false)
        expect(isRetryable(httpError(400))).toBe(false)
    })
})

describe('isInvalidGrant', () => {
    it('detecta el error por el campo response.data.error', () => {
        const error = Object.assign(new Error('x'), { response: { data: { error: 'invalid_grant' } } })
        expect(isInvalidGrant(error)).toBe(true)
    })

    it('detecta el error cuando viene en el mensaje', () => {
        expect(isInvalidGrant(new Error('invalid_grant: token expired'))).toBe(true)
    })

    it('no marca un error genérico como invalid_grant', () => {
        expect(isInvalidGrant(httpError(503))).toBe(false)
    })
})

describe('withGmailRetry', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('devuelve el resultado sin reintentar cuando la operación funciona a la primera', async () => {
        const operation = vi.fn().mockResolvedValue('ok')

        await expect(withGmailRetry(operation)).resolves.toBe('ok')
        expect(operation).toHaveBeenCalledTimes(1)
    })

    it('reintenta con backoff los errores retriables y termina en éxito', async () => {
        vi.useFakeTimers()
        const operation = vi.fn()
            .mockRejectedValueOnce(httpError(503))
            .mockRejectedValueOnce(httpError(429))
            .mockResolvedValueOnce('ok')

        const pending = withGmailRetry(operation)
        await vi.advanceTimersByTimeAsync(5000)

        await expect(pending).resolves.toBe('ok')
        expect(operation).toHaveBeenCalledTimes(3)
    })

    it('no reintenta un error no retriable', async () => {
        const operation = vi.fn().mockRejectedValue(httpError(403))

        await expect(withGmailRetry(operation)).rejects.toThrow(/403/)
        expect(operation).toHaveBeenCalledTimes(1)
    })

    it('no reintenta un invalid_grant aunque no tenga status', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('invalid_grant'))

        await expect(withGmailRetry(operation)).rejects.toThrow('invalid_grant')
        expect(operation).toHaveBeenCalledTimes(1)
    })

    it('se rinde después de 3 intentos con errores retriables', async () => {
        vi.useFakeTimers()
        const operation = vi.fn().mockRejectedValue(httpError(503))

        const pending = withGmailRetry(operation)
        const assertion = expect(pending).rejects.toThrow(/503/)
        await vi.advanceTimersByTimeAsync(5000)
        await assertion

        expect(operation).toHaveBeenCalledTimes(3)
    })
})
