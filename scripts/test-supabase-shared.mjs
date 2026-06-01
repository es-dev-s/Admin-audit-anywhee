/**
 * Verifies audit .env points at the shared signaling Supabase project.
 * Usage: node scripts/test-supabase-shared.mjs
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

async function check(table, label) {
  const { error } = await sb.from(table).select('*').limit(1)
  if (error) {
    console.error(`FAIL ${label}:`, error.message)
    return false
  }
  console.log(`OK  ${label} (${table})`)
  return true
}

let ok = true
ok = (await check('organizations', 'signaling schema')) && ok
ok = (await check('users', 'audit schema (run schema.sql if missing)')) && ok

if (url.includes('ahdurmbfjeyjgssbmqke')) {
  console.error('WARN: still using old audit-only project ref — should match signaling yxpbxexomnpgshrwdbwv')
  ok = false
}

process.exit(ok ? 0 : 1)
