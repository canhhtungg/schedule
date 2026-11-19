import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lunar-javascript')) return 'lunar-vendor'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
