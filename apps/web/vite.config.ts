import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  envDir: '../..',
  envPrefix: 'VITE_',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
  },
})
