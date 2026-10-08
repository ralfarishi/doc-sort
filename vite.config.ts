import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Local mirror of api/state.ts: each scope is persisted to a JSON file next to the project.
 * `missing` is what GET returns before the file exists (404 = "no server data" for master).
 */
const LOCAL_SCOPES = {
  master: { file: '../tumpukan_master.json', allowEmpty: false, missing: null },
  transit: { file: '../tumpukan_transit.json', allowEmpty: true, missing: '{}' },
  handover: { file: '../tumpukan_handover.json', allowEmpty: true, missing: '{}' },
} as const

type LocalScope = keyof typeof LOCAL_SCOPES

function localSyncPlugin(): Plugin {
  return {
    name: 'local-sync-plugin',
    configureServer(server) {
      server.middlewares.use('/api/state', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')

        const scopeParam = new URL(req.url ?? '/', 'http://localhost').searchParams.get('scope') ?? 'master'
        if (!(scopeParam in LOCAL_SCOPES)) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Scope tidak dikenal' }))
          return
        }
        const scope = LOCAL_SCOPES[scopeParam as LocalScope]
        const filePath = path.resolve(__dirname, scope.file)

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(filePath)) {
              res.end(fs.readFileSync(filePath, 'utf-8'))
              return
            }
            if (scope.missing !== null) {
              res.end(scope.missing)
              return
            }
          } catch (e) {
            console.error(`Failed reading ${scopeParam} state`, e)
          }
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'Not found' }))
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const parsed: unknown = JSON.parse(body)
              const isObject = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              const isValid =
                isObject &&
                (scope.allowEmpty || Object.keys(parsed).length > 0) &&
                Object.values(parsed).every(Array.isArray)
              if (!isValid) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Payload tidak valid' }))
                return
              }
              fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
              res.end(JSON.stringify({ success: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Payload tidak valid' }))
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
