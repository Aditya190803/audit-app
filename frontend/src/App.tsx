import React, { useEffect } from 'react'
import { AppShell } from './components/AppShell'
import { useSettingsStore } from './stores/settingsStore'

function App(): React.ReactElement {
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return <AppShell />
}

export default App
