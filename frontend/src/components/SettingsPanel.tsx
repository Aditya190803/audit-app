import React, { useState, useEffect, useRef } from 'react'
import { X, RotateCcw, Plus, Trash2, Save, RefreshCw, Download } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import type { AppUpdateStatus } from '../types/electron'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { settings, loadSettings, updateSettings, resetSettings } = useSettingsStore()
  const [localSettings, setLocalSettings] = useState<Record<string, unknown>>({})
  const [newBroker, setNewBroker] = useState('')
  const [brokers, setBrokers] = useState<string[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({
    status: 'idle',
    message: 'Updates have not been checked yet.'
  })
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen, onClose)

  useEffect(() => {
    if (isOpen) loadSettings()
  }, [isOpen, loadSettings])

  useEffect(() => {
    if (!isOpen) return

    window.electronAPI?.getAppVersion?.().then(setAppVersion).catch(() => setAppVersion(''))
    return window.electronAPI?.onUpdateStatus?.((status) => {
      setUpdateStatus(status)
    })
  }, [isOpen])

  useEffect(() => {
    setLocalSettings(settings)
    setBrokers((settings.broker_list as string[]) || [])
    setKeywords((settings.suspicious_keywords as string[]) || [])
  }, [settings])

  if (!isOpen) return null

  const addKeyword = () => {
    const kw = newKeyword.trim().toLowerCase()
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw])
      setNewKeyword('')
    }
  }

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw))
  }

  const handleSave = async () => {
    await updateSettings({ ...localSettings, broker_list: brokers, suspicious_keywords: keywords })
    onClose()
  }

  const handleReset = async () => {
    if (confirm('Reset all settings to defaults?')) {
      await resetSettings()
    }
  }

  const handleCheckUpdates = async () => {
    const status = await window.electronAPI.checkForUpdates()
    setUpdateStatus(status)
  }

  const handleInstallUpdate = async () => {
    const result = await window.electronAPI.installUpdate()
    if (!result.success) {
      setUpdateStatus({ status: 'error', message: result.error || 'Failed to install update.' })
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
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 id="settings-title" className="text-sm font-semibold text-[var(--text-primary)]">Settings</h2>
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
                ₹{threshold.toLocaleString()}
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

          {/* Updates */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">App Updates</label>
            <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--bg)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Current version{appVersion ? ` ${appVersion}` : ''}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {updateStatus.message}
                  </p>
                  {updateStatus.version && (
                    <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                      Release version: {updateStatus.version}
                    </p>
                  )}
                </div>
                {updateStatus.status === 'downloaded' ? (
                  <button
                    onClick={handleInstallUpdate}
                    className="btn-primary flex shrink-0 items-center gap-1.5 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} />
                    Install
                  </button>
                ) : (
                  <button
                    onClick={handleCheckUpdates}
                    disabled={updateStatus.status === 'checking' || updateStatus.status === 'downloading'}
                    className="btn-secondary flex shrink-0 items-center gap-1.5 text-xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${updateStatus.status === 'checking' || updateStatus.status === 'downloading' ? 'animate-spin' : ''}`} strokeWidth={2} />
                    Check
                  </button>
                )}
              </div>
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

          {/* Suspicious Keywords */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Suspicious Keywords</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                placeholder="Add keyword..."
                className="input-field flex-1"
              />
              <button
                onClick={addKeyword}
                className="btn-primary px-2.5"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 p-2 border border-[var(--border)] rounded-[var(--radius-md)] min-h-[48px]">
              {keywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[var(--danger-subtle)] text-[var(--danger)] rounded-[var(--radius-sm)]">
                  {kw}
                  <button
                    onClick={() => removeKeyword(kw)}
                    className="hover:brightness-75 transition-all"
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={3} />
                  </button>
                </span>
              ))}
              {keywords.length === 0 && (
                <span className="text-xs text-[var(--text-tertiary)] py-1">No keywords configured. Transactions will only be flagged by amount threshold.</span>
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
