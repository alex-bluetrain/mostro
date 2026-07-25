import { describe, it, expect } from 'vitest'
import { buildRawMessage } from './mime'

const params = {
  from: 'mostro@gmail.com',
  to: 'farmacia@proveedor.test',
  subject: 'Pedido de pañales',
  text: 'Talle: M\nSolicitado por: Ana',
}

function decode(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8')
}

describe('buildRawMessage', () => {
  it('encodes with the base64url alphabet and no padding', () => {
    const raw = buildRawMessage(params)
    expect(raw).not.toMatch(/[+/=]/)
  })

  it('includes the addressing headers and separates them from the body with a blank line', () => {
    const message = decode(buildRawMessage(params))
    expect(message).toContain('From: mostro@gmail.com\r\n')
    expect(message).toContain('To: farmacia@proveedor.test\r\n')
    expect(message).toContain('Content-Type: text/plain; charset=UTF-8\r\n')
    expect(message).toContain('Content-Transfer-Encoding: 8bit\r\n')
    expect(message).toContain('\r\n\r\nTalle: M\nSolicitado por: Ana')
  })

  it('encodes the subject in RFC 2047 so accents survive', () => {
    const message = decode(buildRawMessage(params))
    const subjectLine = message.split('\r\n').find(line => line.startsWith('Subject: '))
    expect(subjectLine).toBeDefined()

    const encoded = subjectLine!.replace('Subject: =?UTF-8?B?', '').replace('?=', '')
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe('Pedido de pañales')
  })
})
