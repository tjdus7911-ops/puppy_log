import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CarPreview, { isCarPreview } from './CarPreview.tsx'
import { setupPwa } from './pwa/install'

setupPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCarPreview() ? <CarPreview /> : <App />}
  </StrictMode>,
)
