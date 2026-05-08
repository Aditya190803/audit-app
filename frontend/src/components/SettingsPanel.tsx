import React, { useState, useEffect } from 'react'
import { X, RotateCcw, Plus, Trash2, Save } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { settings, loadSettings, updateSettings, resetSettings } = useSettingsStore()
  const [localSettings, setLocalSettings] = useState<Record<string, unknown>>({})
  const [newBroker, setNewBroker] = useState('')
  const [brokers, setBrokers] = useState<string[]>([])

  useEffect(() => {
    if (isOpen) loadSettings()
  }, [isOpen, loadSettings])

  useEffect(() => {
    setLocalSettings(settings)
    setBrokers((settings.broker_list as string[]) || [])
  }, [settings])

  if (!isOpen) return null

  const handleSave = async () => {
    await updateSettings({ ...localSettings, broker_list: brokers })
    onClose()
  }

  const handleReset = async () => {
    if (confirm('Reset all settings to defaults?')) {
      await resetSettings()
    }
  }

  const addBroker = () => {
    const name = newBroker.trim()
    if (name && !brokers.includes(name)) {
      setBrokers([...brokers, name])
      setNewBroker('')
    }
  }

  const removeBroker = (name: string) => {
    setBrokers(brokers.filter((b) => b !== name))
  }

  const threshold = (localSettings.suspicious_threshold as number) || 10000
  const fuzzyThreshold = (localSettings.fuzzy_match_threshold as number) || 0.75

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors duration-150"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {/* Threshold */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Suspicious Amount Threshold
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1000"
                max="100000"
                step="1000"
                value={threshold}
                onChange={(e) => setLocalSettings({ ...localSettings, suspicious_threshold: Number(e.target.value) })}
                className="flex-1 accent-[var(--primary)]"
              />
              <span className="text-sm font-mono font-medium text-[var(--text-primary)] w-24 text-right">
                ${threshold.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Fuzzy Match */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Fuzzy Match Threshold
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="100"
                step="1"
                value={Math.round(fuzzyThreshold * 100)}
                onChange={(e) => setLocalSettings({ ...localSettings, fuzzy_match_threshold: Number(e.target.value) / 100 })}
                className="flex-1 accent-[var(--primary)]"
              />
              <span className="text-sm font-mono font-medium text-[var(--text-primary)] w-12 text-right">
                {Math.round(fuzzyThreshold * 100)}%
              </span>
            </div>
          </div>

          {/* Brokers */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Broker List</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newBroker}
                onChange={(e) => setNewBroker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addBroker()}
                placeholder="Add broker..."
                className="input-field flex-1"
              />
              <button
                onClick={addBroker}
                className="btn-primary px-2.5"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto border border-[var(--border)] rounded-[var(--radius-md)] p-1.5">
              {brokers.map((broker) => (
                <div key={broker} className="flex items-center justify-between px-2.5 py-1.5 bg-[var(--bg)] rounded-[var(--radius-sm)]">
                  <span className="text-sm text-[var(--text-primary)]">{broker}</span>
                  <button
                    onClick={() => removeBroker(broker)}
                    className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors duration-150"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              ))}
              {brokers.length === 0 && (
                <div className="text-xs text-[var(--text-tertiary)] py-2 text-center">No brokers configured</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button
            onClick={handleReset}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            Reset
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex items-center gap-1.5 text-xs"
          >
            <Save className="h-3.5 w-3.5" strokeWidth={2} />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
