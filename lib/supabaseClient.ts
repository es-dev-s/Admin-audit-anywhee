// lib/supabaseClient.ts
// Server-only Supabase client using the SERVICE_ROLE_KEY.
// This file must NEVER be imported from a "use client" component.
// Next.js will throw a build error if you accidentally do so.
//
// This is the canonical Supabase client for all server-side operations.
// Bypasses RLS since we use service_role key — all access control
// is enforced in application code.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
  );
}

export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
