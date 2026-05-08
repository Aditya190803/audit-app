import { create } from 'zustand'

interface SettingsState {
  settings: Record<string, unknown>
  isLoading: boolean
  loadSettings: () => Promise<void>
  updateSetting: (key: string, value: unknown) => Promise<void>
  updateSettings: (updates: Record<string, unknown>) => Promise<void>
  resetSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  isLoading: false,
  loadSettings: async () => {
    set({ isLoading: true })
    try {
      const { getSettings } = await import('../lib/api')
      const res = await getSettings()
      set({ settings: res.data, isLoading: false })
    } catch (e) {
      console.error('Failed to load settings:', e)
      set({ isLoading: false })
    }
  },
  updateSetting: async (key, value) => {
    const { updateSettings } = await import('../lib/api')
    await updateSettings({ [key]: value })
    set({ settings: { ...get().settings, [key]: value } })
  },
  updateSettings: async (updates) => {
    const { updateSettings } = await import('../lib/api')
    await updateSettings(updates)
    set({ settings: { ...get().settings, ...updates } })
  },
  resetSettings: async () => {
    const { resetSettings } = await import('../lib/api')
    const res = await resetSettings()
    set({ settings: res.data })
  }
}))
