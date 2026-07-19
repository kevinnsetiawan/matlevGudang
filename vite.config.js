import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 3001,
    // E2E owns its browser lifecycle. Never open a real user browser there.
    open: mode === 'e2e' ? false : true
  }
}))
