import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'

if (import.meta.env.DEV) {
  // Test/automation hooks (development builds only).
  void Promise.all([import('./store/store'), import('./store/actions'), import('./dev/sample'), import('./voice/session'), import('./store/fileStore'), import('./dev/demoFamily')]).then(([st, actions, sample, v, fs, demo]) => {
    ;(window as unknown as Record<string, unknown>).__smaran = { ...st, ...actions, ...sample, ...demo, voice: v.voice, fileStore: fs.fileStore }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
