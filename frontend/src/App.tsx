import React, { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { LicenseGate } from './components/LicenseGate'
import { useSettingsStore } from './stores/settingsStore'

function App(): React.ReactElement {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const [licenseRevoked, setLicenseRevoked] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Listen for license-revoked IPC event from main process
  useEffect(() => {
    if (!window.electronAPI?.onLicenseRevoked) return undefined
    return window.electronAPI.onLicenseRevoked(() => {
      setLicenseRevoked(true)
    })
  }, [])

  return (
    <>
      <AppShell />
      {licenseRevoked && <LicenseGate />}
    </>
  )
}

export default App
