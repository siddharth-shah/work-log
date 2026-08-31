import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  // Relative asset paths work both on static web hosts and chrome-extension:// pages.
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        popup: `${root}popup.html`,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
