import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PasswordGate from './PasswordGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PasswordGate />
  </StrictMode>,
)

