import { describe, it, expect } from 'vitest'
import { appConfig } from './app.config'
import { auth, gmail } from '@googleapis/gmail'

describe('appConfig', () => {
  it('exposes the required Gmail settings as strings', () => {
    expect(typeof appConfig.GMAIL_MAILER_CLIENT_ID).toBe('string')
    expect(typeof appConfig.GMAIL_MAILER_CLIENT_SECRET).toBe('string')
    expect(typeof appConfig.GMAIL_MAILER_REFRESH_TOKEN).toBe('string')
    expect(typeof appConfig.GMAIL_MAILER_SENDER).toBe('string')
  })

  it('exposes one recipient per domain', () => {
    expect(typeof appConfig.DIAPERS_EMAIL_TO).toBe('string')
    expect(typeof appConfig.MEDS_EMAIL_TO).toBe('string')
    expect(typeof appConfig.REFUNDS_EMAIL_TO).toBe('string')
  })
})

describe('@googleapis/gmail', () => {
  it('exposes auth.OAuth2 and the gmail factory as named ESM imports', () => {
    expect(typeof auth.OAuth2).toBe('function')
    expect(typeof gmail).toBe('function')
  })
})
