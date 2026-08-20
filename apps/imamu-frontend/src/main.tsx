import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
// Self-hosted fonts (no runtime Google Fonts dependency — see A2).
// Geist (variable) carries all Latin body + headings; IBM Plex Sans Arabic
// carries every Arabic glyph at the three weights the UI uses.
import '@fontsource-variable/geist/index.css'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import './index.css'
import { LanguageProvider } from './i18n/context'
import { AuthProvider } from '@/context/AuthContext'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)
