import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { requestPersistentStorage } from './lib/persistence'
import { ensureSettings } from './lib/settings'
import './index.css'

// Pedimos almacenamiento persistente cuanto antes para que el navegador
// no desaloje los datos (clave en móviles).
requestPersistentStorage()
// Persistimos los ajustes por defecto una sola vez (fuera de cualquier liveQuery).
ensureSettings()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename: en GitHub Pages la app vive en /Ludok-time/, en local en / */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
