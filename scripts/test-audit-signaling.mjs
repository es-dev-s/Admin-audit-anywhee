/**
 * Verifies audit dashboard signaling wiring: admin-login → admin-get-clients.
 * Usage: node scripts/test-audit-signaling.mjs [wssUrl]
 */
import WebSocket from 'ws'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const wss =
  process.argv[2] ||
  process.env.NEXT_PUBLIC_ANYWHERE_SIGNALING_WSS ||
  'ws://10.80.80.221:18085'
const token = (process.env.NEXT_PUBLIC_WS_CONNECT_TOKEN || '').replace(/^"|"$/g, '')
const org = (process.env.NEXT_PUBLIC_AUDIT_ORG_NAME || 'esadmin').replace(/^"|"$/g, '')
const user = (process.env.NEXT_PUBLIC_AUDIT_USERNAME || 'root').replace(/^"|"$/g, '')
const pass = (process.env.NEXT_PUBLIC_AUDIT_PASSWORD || '').replace(/^"|"$/g, '')

const url = token ? `${wss}?token=${encodeURIComponent(token)}` : wss

const ws = new WebSocket(url)
const t = setTimeout(() => {
  console.error('FAIL: timeout')
  process.exit(1)
}, 20000)

ws.on('error', (e) => {
  clearTimeout(t)
  console.error('FAIL:', e.message)
  process.exit(1)
})

ws.on('open', () => {
  console.log('OK  WebSocket open')
  ws.send(JSON.stringify({ type: 'admin-login', orgName: org, username: user, password: pass }))
})

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.type === 'admin-login-response') {
    if (!msg.success) {
      clearTimeout(t)
      console.error('FAIL: admin-login', msg.message || msg.error)
      process.exit(1)
    }
    console.log('OK  admin-login — role:', msg.admin?.role)
    ws.send(JSON.stringify({ type: 'admin-get-clients', token: msg.token }))
    ws.send(JSON.stringify({ type: 'admin-get-orgs', token: msg.token }))
  }
  if (msg.type === 'admin-get-clients-response' && msg.success) {
    const n = Array.isArray(msg.clients) ? msg.clients.length : 0
    console.log('OK  admin-get-clients — count:', n)
    if (n > 0) {
      const c = msg.clients[0]
      console.log('    sample:', c.fullName, 'id=', c.id, 'status=', c.status)
    }
  }
  if (msg.type === 'admin-get-orgs-response' && msg.success) {
    console.log('OK  admin-get-orgs — count:', msg.orgs?.length ?? 0)
    clearTimeout(t)
    console.log('\nAudit ↔ signaling wiring OK.')
    process.exit(0)
  }
})
