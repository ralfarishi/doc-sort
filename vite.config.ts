import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function localSyncPlugin(): Plugin {
  const masterFilePath = path.resolve(__dirname, '../tumpukan_master.json')

  return {
    name: 'local-sync-plugin',
    configureServer(server) {
      server.middlewares.use('/api/state', (req, res) => {
        if (req.method === 'GET') {
          try {
            if (fs.existsSync(masterFilePath)) {
              const data = fs.readFileSync(masterFilePath, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
              return
            }
          } catch (e) {
            console.error('Failed reading master state', e)
          }
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'Not found' }))
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const parsed = JSON.parse(body)
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Payload tidak valid' }))
                return
              }
              fs.writeFileSync(masterFilePath, JSON.stringify(parsed, null, 2), 'utf-8')
              res.end(JSON.stringify({ success: true }))
            } catch {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Failed saving master state' }))
            }
          })
        } else {
          res.statusCode = 405
          res.setHeader('Allow', 'GET, POST')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localSyncPlugin()],
  server: {
    host: true,
  },
})
