import { createClient } from '@supabase/supabase-js';

let client;

export function getSupabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function rowToEntry(row) {
  return {
    id: Number(row.id),
    type: row.type,
    version: row.version ?? 2,
    title: row.title || '',
    period: row.period || '',
    savedAt: row.saved_at,
    payload: row.payload,
    cloud: true,
  };
}

export function entryToRow(entry) {
  return {
    id: entry.id,
    type: entry.type,
    title: entry.title || null,
    period: entry.period || null,
    version: entry.version ?? 2,
    payload: entry.payload,
    saved_at: entry.savedAt,
  };
}
