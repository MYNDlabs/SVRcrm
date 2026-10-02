// geocode — Supabase Edge Function
//
// Purpose: look up latitude/longitude for a prospect's address, so the
// dashboard map can place a pin for it. This runs server-side because the
// free geocoding service this uses (OpenStreetMap's Nominatim) requires
// requests to identify themselves with a contact email in the User-Agent
// header — something a browser cannot set on its own fetch() calls — and
// because looking a prospect up once and caching the result (see
// schema.sql) is both faster for your team and respectful of Nominatim's
// shared, free service.
//
// IMPORTANT — before deploying, edit CONTACT_EMAIL below to your own team's
// email address. Nominatim's usage policy requires this so they can reach
// you if there's ever a problem with how it's used:
//   https://operations.osmfoundation.org/policies/nominatim/
// Leaving the placeholder in place risks your requests being blocked.
//
// Security notes (read before deploying):
//  - This function refuses to run unless the caller is signed in with a
//    valid Supabase session for this project. That check happens in code
//    below (auth.getUser), not just via the platform's default JWT check,
//    so it stays safe even if that default is ever changed.
//  - It only ever sends the address text already stored for a prospect to
//    Nominatim — nothing else about your data leaves this function.
//  - It caps how long it will wait for a response.
//
// Deploy this from the Supabase Dashboard: Edge Functions -> Deploy a new
// function -> Via Editor -> paste this whole file -> Deploy. See README.md
// for the full walkthrough. This feature is optional — the app and the
// dashboard's map panel work fine without it, just without pins on the map
// until this is deployed.

import { createClient } from 'npm:@supabase/supabase-js@2';

// EDIT THIS before deploying — Nominatim requires a way to contact you.
const CONTACT_EMAIL = 'admin@zymkhize.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FETCH_TIMEOUT_MS = 10000; // give the geocoder 10s to respond

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    // 2. Validate the request.
    let body: { address?: string };
    try { body = await req.json(); } catch { return json({ error: 'Expected JSON body with an address.' }, 400); }
    const address = (body?.address || '').trim();
    if (!address) return json({ error: 'Missing address.' }, 400);

    // 3. Ask Nominatim (OpenStreetMap's free geocoder) to look it up.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
    let resp: Response;
    try {
      resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Required by Nominatim's usage policy: a descriptive User-Agent
          // with a way to contact you. Browsers can't set a custom
          // User-Agent from fetch(), which is why this runs server-side.
          'User-Agent': 'SVRPipelineGeocoder/1.0 (' + CONTACT_EMAIL + ')',
          'Accept': 'application/json',
        },
      });
    } catch (_e) {
      clearTimeout(timer);
      return json({ error: 'Could not reach the geocoding service. Try again shortly.' }, 502);
    }
    clearTimeout(timer);

    if (!resp.ok) {
      return json({ error: 'The geocoding service responded with an error (HTTP ' + resp.status + ').' }, 502);
    }

    let results: Array<{ lat: string; lon: string; display_name?: string }>;
    try { results = await resp.json(); } catch { return json({ error: 'The geocoding service returned something unexpected.' }, 502); }

    if (!Array.isArray(results) || results.length === 0) {
      return json({ error: 'No location found for that address.' }, 404);
    }

    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) {
      return json({ error: 'The geocoding service returned an invalid location.' }, 502);
    }

    return json({ lat, lng, displayName: results[0].display_name || address });
  } catch (e) {
    return json({ error: 'Unexpected error: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
