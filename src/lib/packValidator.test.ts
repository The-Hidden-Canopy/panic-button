import { describe, expect, it } from 'vitest'
import { etc, getPublicKeyAsync, signAsync } from '@noble/ed25519'
import { scenarios } from '../data/scenarios'
import { MAX_PACK_BYTES, admitPack, canonicalPackPayload, packFromScenarios, packSignerFingerprint, parseScenarioPack, validatePack, verifyPackSignature } from './packValidator'

describe('scenario-pack validator', () => {
  it('accepts every built-in scenario', () => {
    const issues = validatePack(packFromScenarios(scenarios, 'Built-in Incidents'))
    expect(issues.filter((item) => item.severity === 'error')).toEqual([])
    expect(scenarios).toHaveLength(10)
  })

  it('rejects executable content', () => {
    const result = parseScenarioPack(JSON.stringify({ ...packFromScenarios([scenarios[0]]), script: 'alert(1)' }))
    expect(result.pack).toBeUndefined()
    expect(result.issues.some((item) => item.path === 'pack.script')).toBe(true)
  })

  it('rejects unsafe asset traversal', () => {
    const pack = { ...packFromScenarios([scenarios[0]]), assets: [{ id: 'map', kind: 'image' as const, path: '../map.png', bytes: 10 }] }
    const issues = validatePack(pack)
    expect(issues.some((item) => item.path.endsWith('.path'))).toBe(true)
  })

  it('rejects oversized pack text before parsing', () => {
    const result = parseScenarioPack('x'.repeat(MAX_PACK_BYTES + 1))
    expect(result.pack).toBeUndefined()
    expect(result.issues[0].message).toContain('safety limit')
  })

  it('rejects duplicate scenario and asset identifiers', () => {
    const base = scenarios[0]
    const pack = {
      ...packFromScenarios([base, { ...base }]),
      assets: [
        { id: 'map', kind: 'image' as const, path: 'map.png', bytes: 10 },
        { id: 'map', kind: 'image' as const, path: 'map-2.png', bytes: 10 },
      ],
    }
    const issues = validatePack(pack)
    expect(issues.some((item) => item.message.includes('Duplicate scenario id'))).toBe(true)
    expect(issues.some((item) => item.message.includes('Duplicate asset id'))).toBe(true)
  })

  it('rejects external URLs embedded in scenario content', () => {
    const pack = { ...packFromScenarios([{ ...scenarios[0], premise: 'Read https://example.invalid now.' }]) }
    const issues = validatePack(pack)
    expect(issues.some((item) => item.message.includes('External URLs'))).toBe(true)
  })

  it('accepts unsigned local packs but exposes the unsigned state', async () => {
    const result = await verifyPackSignature(packFromScenarios([scenarios[0]]))
    expect(result).toEqual({ valid: true, unsigned: true })
  })

  it('rejects malformed Ed25519 signature metadata', () => {
    const pack = { ...packFromScenarios([scenarios[0]]), signature: { algorithm: 'ed25519' as const, publicKey: 'bad', value: 'bad' } }
    const issues = validatePack(pack)
    expect(issues.some((item) => item.path === 'pack.signature.publicKey')).toBe(true)
    expect(issues.some((item) => item.path === 'pack.signature.value')).toBe(true)
  })

  it('verifies a valid Ed25519-signed pack', async () => {
    const secretKey = etc.hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
    const unsigned = packFromScenarios([scenarios[0]])
    const signature = await signAsync(new TextEncoder().encode(canonicalPackPayload(unsigned)), secretKey)
    const signed = { ...unsigned, signature: { algorithm: 'ed25519' as const, publicKey: etc.bytesToHex(await getPublicKeyAsync(secretKey)), value: etc.bytesToHex(signature) } }
    await expect(verifyPackSignature(signed)).resolves.toEqual({ valid: true, unsigned: false })
  })

  it('separates signature validity from trusted signer admission', async () => {
    const secretKey = etc.hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
    const publicKey = etc.bytesToHex(await getPublicKeyAsync(secretKey))
    const unsigned = { ...packFromScenarios([scenarios[0]]), signer: { fingerprint: await packSignerFingerprint(publicKey), displayName: 'Local Test Signer', publicKey } }
    const signature = await signAsync(new TextEncoder().encode(canonicalPackPayload(unsigned)), secretKey)
    const signed = { ...unsigned, signature: { algorithm: 'ed25519' as const, publicKey, value: etc.bytesToHex(signature) } }
    await expect(admitPack(signed)).resolves.toMatchObject({ signatureValid: true, signerKnown: false, signerTrusted: false, state: 'VALID_UNTRUSTED' })
    await expect(admitPack(signed, [{ ...signed.signer, trustState: 'trusted' }])).resolves.toMatchObject({ signatureValid: true, signerKnown: true, signerTrusted: true, state: 'TRUSTED' })
  })

  it('rejects unbounded graph cycles and unsupported conditions', () => {
    const base = scenarios[0]
    const invalid = { ...base, nodes: [{ id: 'start', type: 'CHOICE' as const, branches: [{ next: 'start', when: { kind: 'not-a-condition' } }] }] } as unknown as typeof base
    const issues = validatePack({ ...packFromScenarios([invalid]), schemaVersion: 2 })
    expect(issues.some((issue) => issue.message.includes('Unsupported condition'))).toBe(true)
    expect(issues.some((issue) => issue.message.includes('terminal'))).toBe(true)
    expect(issues.some((issue) => issue.message.includes('Cycles require'))).toBe(true)
  })

  it('requires bounded captioned local audio cues', () => {
    const invalid = { ...scenarios[0], audio: [{ id: 'bad', kind: 'network' as never, caption: '', durationMs: 1 }] }
    const issues = validatePack({ ...packFromScenarios([invalid]) })
    expect(issues.some((issue) => issue.path.includes('.audio.bad'))).toBe(true)
  })
})
