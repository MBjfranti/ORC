import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.js'
// Self-hosted, so the panel renders the same offline and on first paint.
// Saira Semi Condensed is the closest free face to Eurostile/Microgramma —
// the squarish 1960s-70s tech type — and stays legible at silkscreen sizes.
// IBM Plex Mono carries IBM's own period computing heritage on the screen.
import '@fontsource/saira-semi-condensed/400.css'
import '@fontsource/saira-semi-condensed/500.css'
import '@fontsource/saira-semi-condensed/600.css'
import '@fontsource/saira-semi-condensed/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'

import './ui/styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
