import { useState } from 'react'
import AISettings from '../boards/AISettings'
import { loadAIConfig } from '../utils/aiConfig'
import '../styles/ai-settings.css'

export default function AISettingsPage() {
  const [config, setConfig] = useState(loadAIConfig)
  return <AISettings config={config} onChange={setConfig} />
}
