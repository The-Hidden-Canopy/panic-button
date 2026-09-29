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
