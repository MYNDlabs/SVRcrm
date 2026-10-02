// fetch-page — Supabase Edge Function
//
// Purpose: fetch a web page's HTML on the server side so the SVR Pipeline
// app can read it, since a browser is not allowed to fetch most other
// websites directly (CORS). The app parses the returned HTML itself —
// this function's only job is to safely retrieve it.
//
// Security notes (read before deploying):
//  - This function refuses to run unless the caller is signed in with a
//    valid Supabase session for this project. That check happens in code
//    below (auth.getUser), not just via the platform's default JWT check,
//    so it stays safe even if that default is ever changed.
//  - It refuses to fetch private/internal addresses (localhost, 127.x,
//    10.x, 172.16-31.x, 192.168.x, 169.254.x, etc.) so it can't be used to
//    probe internal network resources.
//  - It caps how much it will download and how long it will wait, so one
//    slow or huge page can't tie up the function.
//
// Deploy this from the Supabase Dashboard: Edge Functions -> Deploy a new
// function -> Via Editor -> paste this whole file -> Deploy. See README.md
// for the full walkthrough.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BYTES = 4 * 1024 * 1024; // stop downloading after 4MB
const FETCH_TIMEOUT_MS = 20000; // give the target page 20s to respond

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Blocks obviously-internal/private hosts. This is a baseline guard, not a
// substitute for keeping this function limited to your own signed-in team.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::1') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local / cloud metadata endpoint
    if (a === 0) return true;
  }
  return false;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    // 1. Require a signed-in user (checked explicitly, not just relied on).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Not signed in.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      return json({ error: 'Server is missing its Supabase configuration.' }, 500);
    }
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);

    // 2. Validate the requested URL.
    let body: { url?: string };
    try { body = await req.json(); } catch { return json({ error: 'Expected JSON body with a url.' }, 400); }
    const rawUrl = body?.url;
    if (!rawUrl || typeof rawUrl !== 'string') return json({ error: 'Missing url.' }, 400);

    let target: URL;
    try { target = new URL(rawUrl); } catch { return json({ error: 'That is not a valid URL.' }, 400); }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return json({ error: 'Only http:// and https:// URLs are supported.' }, 400);
    }
    if (isBlockedHost(target.hostname)) {
      return json({ error: 'That address is not allowed.' }, 400);
    }

    // 3. Fetch with a timeout, following redirects but re-checking the final host.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(target.toString(), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          // A normal browser UA (rather than a self-identifying bot string) so
          // ordinary marketing/portfolio sites don't reflexively block the
          // request — this function still only runs for your signed-in team.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (_e) {
      clearTimeout(timer);
      return json({ error: 'Could not reach that page. It may be blocking automated requests, or it timed out.' }, 502);
    }
    clearTimeout(timer);

    let finalHost = '';
    try { finalHost = new URL(resp.url).hostname; } catch { /* ignore */ }
    if (finalHost && isBlockedHost(finalHost)) {
      return json({ error: 'That address is not allowed.' }, 400);
    }

    if (!resp.ok) {
      return json({ error: 'The page responded with an error (HTTP ' + resp.status + ').' }, 502);
    }

    const contentType = resp.headers.get('content-type') || '';
    if (contentType && !/text\/html|xml|text\/plain/i.test(contentType)) {
      return json({ error: 'That page is not readable HTML (got ' + contentType + ').' }, 415);
    }

    // 4. Read the body with a hard size cap.
    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;
    const reader = resp.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.length;
          if (received > MAX_BYTES) { truncated = true; try { await reader.cancel(); } catch { /* ignore */ } break; }
          chunks.push(value);
        }
      }
    }
    const html = new TextDecoder('utf-8').decode(concatChunks(chunks));

    return json({ html, finalUrl: resp.url, truncated });
  } catch (e) {
    return json({ error: 'Unexpected error: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
