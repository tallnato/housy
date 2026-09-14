import { defineConfig } from 'vite'

// Deployed to https://<user>.github.io/housy/ — the base path must match the repo name.
// Override with BASE_PATH=/ when serving from a domain root.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/housy/',
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
})
