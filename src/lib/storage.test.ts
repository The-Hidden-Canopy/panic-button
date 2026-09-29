import { describe, expect, it } from 'vitest'
import { decodeStored, encodeStored } from './storage'

describe('versioned storage envelope', () => {
  it('round-trips values with a checksum', () => {
    const value = { status: 'nominal', count: 3 }
    expect(decodeStored<typeof value>(encodeStored(value))).toEqual(value)
  })

  it('rejects tampered or legacy payloads', () => {
    const encoded = JSON.parse(encodeStored({ status: 'nominal' })) as { value: { status: string } }
    encoded.value.status = 'compromised'
    expect(decodeStored(JSON.stringify(encoded))).toBeUndefined()
    expect(decodeStored('{"status":"nominal"}')).toBeUndefined()
  })
})
