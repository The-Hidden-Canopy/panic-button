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
