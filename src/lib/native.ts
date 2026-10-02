declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export const registerGlobalTrigger = async (onTrigger: () => void): Promise<(() => Promise<void>) | null> => {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return null
  try {
    const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut')
    const shortcut = 'CommandOrControl+Shift+P'
    await register(shortcut, onTrigger)
    return async () => unregister(shortcut)
  } catch {
    return null
  }
}

export const isTauriRuntime = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

export const nativeStorageGet = async (key: string): Promise<string | null> => {
  if (!isTauriRuntime()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string | null>('storage_get', { key })
  } catch {
    return null
  }
}

export const nativeStorageSet = async (key: string, value: string): Promise<boolean> => {
  if (!isTauriRuntime()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('storage_set', { key, value })
    return true
  } catch {
    return false
  }
}

export const nativeStorageDelete = async (key: string): Promise<boolean> => {
  if (!isTauriRuntime()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('storage_delete', { key })
    return true
  } catch {
    return false
  }
}

export const nativeIncidentStoreEvent = async (incidentId: string, sequence: number, event: unknown, eventDigest: string, lifecycle: string, startedAt: number): Promise<boolean> => {
  if (!isTauriRuntime()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('incident_store_event', { incidentId, sequence, eventJson: JSON.stringify(event), eventDigest, lifecycle, startedAt })
    return true
  } catch {
    return false
  }
}

export const nativeIncidentLoadEvents = async (incidentId: string): Promise<unknown[]> => {
  if (!isTauriRuntime()) return []
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const rows = await invoke<string[]>('incident_load_events', { incidentId })
    return rows.map((row) => JSON.parse(row) as unknown)
  } catch {
    return []
  }
}

export const nativeTrustSigner = async (signer: { fingerprint: string; displayName: string; publicKey: string; trustState: 'trusted' | 'local' | 'blocked' | 'unknown' }): Promise<boolean> => {
  if (!isTauriRuntime()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('trust_signer', { fingerprint: signer.fingerprint, displayName: signer.displayName, publicKey: signer.publicKey, trustState: signer.trustState })
    return true
  } catch {
    return false
  }
}

export const nativeTrustedSigners = async (): Promise<unknown[]> => {
  if (!isTauriRuntime()) return []
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const rows = await invoke<string[]>('trusted_signers')
    return rows.map((row) => JSON.parse(row) as unknown)
  } catch {
    return []
  }
}

export const nativeProjectionSet = async (projection: unknown): Promise<boolean> => {
  if (!isTauriRuntime()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('storage_set', { key: 'panic-button-live-projection', value: JSON.stringify(projection) })
    return true
  } catch {
    return false
  }
}

export const nativeProjectionGet = async (): Promise<unknown | undefined> => {
  if (!isTauriRuntime()) return undefined
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const value = await invoke<string | null>('storage_get', { key: 'panic-button-live-projection' })
    return value ? JSON.parse(value) as unknown : undefined
  } catch {
    return undefined
  }
}

export const setTheaterMode = async (enabled: boolean, alwaysOnTop: boolean, mirrorSecondary = false): Promise<void> => {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const appWindow = getCurrentWindow()
    await appWindow.setFullscreen(enabled)
    await appWindow.setAlwaysOnTop(enabled && alwaysOnTop)
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_surveillance_windows', { enabled: enabled && mirrorSecondary })
  } catch {
    // Browser preview and restricted desktop shells remain in a normal window.
  }
}
