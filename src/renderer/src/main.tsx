import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'

function App(): JSX.Element {
  return <div style={{ padding: 24, color: '#e2e8f0' }}>Flint is running on Electron.</div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
