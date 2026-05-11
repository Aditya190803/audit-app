import { create } from 'zustand'
import {
  getSettings,
  resetSettings as resetSettingsApi,
  updateSettings as updateSettingsApi
} from '../lib/api'

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
      const res = await getSettings()
      set({ settings: res.data, isLoading: false })
    } catch (e) {
      console.error('Failed to load settings:', e)
      set({ isLoading: false })
    }
  },
  updateSetting: async (key, value) => {
    await updateSettingsApi({ [key]: value })
    set({ settings: { ...get().settings, [key]: value } })
  },
  updateSettings: async (updates) => {
    await updateSettingsApi(updates)
    set({ settings: { ...get().settings, ...updates } })
  },
  resetSettings: async () => {
    const res = await resetSettingsApi()
    set({ settings: res.data })
  }
}))
