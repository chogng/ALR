import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './polyfills'
import './index.css'
import App from './App.tsx'

if (localStorage.getItem('debug_startup') === '1') {
  console.time('startup:render');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      console.timeEnd('startup:render');
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
