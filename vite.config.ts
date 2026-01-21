import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { ServerOptions as HttpsServerOptions } from 'node:https'
import selfsigned from 'selfsigned'

// https://vite.dev/config/
const httpsConfig = (): HttpsServerOptions => {
  const defaultKeyPath = path.resolve('certs', 'localhost-key.pem')
  const defaultCertPath = path.resolve('certs', 'localhost.pem')
  const keyPath = process.env.VITE_DEV_HTTPS_KEY ?? defaultKeyPath
  const certPath = process.env.VITE_DEV_HTTPS_CERT ?? defaultCertPath

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    const attrs = [{ name: 'commonName', value: 'localhost' }]
    const generated = selfsigned.generate(attrs, {
      days: 30,
      keySize: 2048,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' },
            { type: 7, ip: '::1' },
          ],
        },
      ],
    })

    return {
      key: generated.private,
      cert: generated.cert,
    }
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }
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
    host: 'localhost',
    https: command === 'serve' ? httpsConfig() : undefined,
    port: 5173,
  },
}))
