import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const getHttpsConfig = () => {
  const keyPath = process.env.VITE_DEV_HTTPS_KEY ?? path.resolve('certs', 'localhost-key.pem')
  const certPath = process.env.VITE_DEV_HTTPS_CERT ?? path.resolve('certs', 'localhost.pem')

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  }

  return undefined
}

export default defineConfig(({ command }) => ({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  server: {
    host: 'integration-nvoip',
    port: 3000,
    https: command === 'serve' ? getHttpsConfig() : undefined,
  },
  base: '/hubspot-callback/',
}))
