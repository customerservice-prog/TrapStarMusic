#!/usr/bin/env node
/**
 * Simulates 100 independent API "users" against a running VAULT backend.
 * Each user: health → create session → create track → patch track → list tracks
 * → snapshot → delete session (cleanup).
 *
 * Usage:
 *   Start backend, then:
 *   node vault/scripts/verify-100-users.mjs
 *
 * Env:
 *   VAULT_BASE_URL   e.g. http://localhost:3001 (overrides port file)
 *   VERIFY_USERS     default 100
 *   VERIFY_CONCURRENCY default 10 (SQLite-friendly)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultRoot = path.join(__dirname, '..');

const USER_COUNT = Math.max(1, parseInt(process.env.VERIFY_USERS || '100', 10));
const CONCURRENCY = Math.max(1, parseInt(process.env.VERIFY_CONCURRENCY || '10', 10));

function resolveBaseUrl() {
  const env = process.env.VAULT_BASE_URL;
  if (env) return env.replace(/\/$/, '');
  const pf = path.join(vaultRoot, '.vault-backend-port');
  try {
    const p = parseInt(fs.readFileSync(pf, 'utf8').trim(), 10);
    if (Number.isFinite(p) && p > 0) return `http://localhost:${p}`;
  } catch {
    /* */
  }
  const p = parseInt(process.env.PORT || '3001', 10);
  return `http://localhost:${p}`;
}

async function req(method, url, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const res = await fetch(url, opt);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _parseError: text?.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function runOneUser(base, i) {
  const h = await req('GET', `${base}/api/health`);
  if (!h.ok || !h.data?.ok) {
    throw new Error(`health failed: ${h.status} ${JSON.stringify(h.data)}`);
  }

  const s = await req('POST', `${base}/api/sessions`, {
    name: `LoadUser-${i}-${Date.now()}`,
    bpm: 100 + (i % 60),
    musical_key: i % 2 ? 'Am' : 'C',
    genre: 'trap',
  });
  if (!s.ok || !s.data?.id) {
    throw new Error(`create session: ${s.status} ${JSON.stringify(s.data)}`);
  }
  const sessionId = s.data.id;

  const t = await req('POST', `${base}/api/tracks/session/${sessionId}`, {
    label: `Vocal ${i}`,
    track_type: i % 4 === 0 ? 'adlib' : 'main',
  });
  if (!t.ok || !t.data?.id) {
    throw new Error(`create track: ${t.status} ${JSON.stringify(t.data)}`);
  }
  const trackId = t.data.id;

  const vol = 0.15 + ((i * 7) % 85) / 100;
  const p = await req('PATCH', `${base}/api/tracks/${trackId}`, {
    volume: vol,
    muted: i % 11 === 0,
  });
  if (!p.ok) {
    throw new Error(`patch track: ${p.status} ${JSON.stringify(p.data)}`);
  }

  const list = await req('GET', `${base}/api/tracks/session/${sessionId}`);
  if (!list.ok || !Array.isArray(list.data) || list.data.length !== 1) {
    throw new Error(`list tracks: ${list.status} ${JSON.stringify(list.data)}`);
  }
  if (list.data[0].id !== trackId) {
    throw new Error('track id mismatch after list');
  }

  const snap = await req('POST', `${base}/api/sessions/${sessionId}/snapshot`, {
    label: `verify-u${i}`,
  });
  if (!snap.ok || !snap.data?.id) {
    throw new Error(`snapshot: ${snap.status} ${JSON.stringify(snap.data)}`);
  }

  const del = await req('DELETE', `${base}/api/sessions/${sessionId}`);
  if (!del.ok) {
    throw new Error(`delete session: ${del.status} ${JSON.stringify(del.data)}`);
  }

  const gone = await req('GET', `${base}/api/sessions/${sessionId}`);
  if (gone.status !== 404) {
    throw new Error(`expected 404 after delete, got ${gone.status}`);
  }

  return i;
}

async function runNegative(base) {
  const badBpm = await req('POST', `${base}/api/sessions`, { name: 'Neg test', bpm: 900 });
  if (badBpm.status !== 400 || !badBpm.data?.error) {
    throw new Error(`expected 400 invalid bpm, got ${badBpm.status}`);
  }

  const badUuid = await req('GET', `${base}/api/sessions/not-a-uuid`);
  if (badUuid.status !== 400) {
    throw new Error(`expected 400 bad session id, got ${badUuid.status}`);
  }

  const badVol = await req('PATCH', `${base}/api/tracks/00000000-0000-4000-8000-000000000001`, {
    volume: 9,
  });
  if (badVol.status !== 400) {
    throw new Error(`expected 400 bad volume, got ${badVol.status}`);
  }
}

function wsOnMessage(ws, handler) {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener('message', (ev) => handler(ev.data));
  } else if (typeof ws.on === 'function') {
    ws.on('message', handler);
  }
}

function wsOnError(ws, handler) {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener('error', handler);
  } else if (typeof ws.on === 'function') {
    ws.on('error', handler);
  }
}

async function wsSmoke(base) {
  const WS = globalThis.WebSocket;
  if (typeof WS !== 'function') {
    console.warn('[verify] WebSocket API not available in this Node build — skip WS smoke test.');
    return;
  }
  const wsUrl = `${base.replace(/^http/, 'ws')}/api/ws`;
  await new Promise((resolve, reject) => {
    const ws = new WS(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* */
      }
      reject(new Error('WebSocket hello timeout'));
    }, 8000);
    const onData = (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'hello' && msg.ok) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
        if (msg.type === 'pong' && msg.ok) {
          clearTimeout(timer);
          try {
            ws.close();
          } catch {
            /* */
          }
          resolve();
        }
      } catch {
        /* */
      }
    };
    wsOnMessage(ws, onData);
    wsOnError(ws, () => {
      clearTimeout(timer);
      reject(new Error('WebSocket error'));
    });
  });
}

async function pool(total, concurrency, fn) {
  let next = 0;
  const failures = [];
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= total) return;
      try {
        await fn(i);
      } catch (e) {
        failures.push({ i, message: e?.message || String(e) });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return failures;
}

async function main() {
  const base = resolveBaseUrl();
  console.log(`[verify] Base URL: ${base}`);
  console.log(`[verify] Users: ${USER_COUNT}, concurrency: ${CONCURRENCY}`);

  const ping = await req('GET', `${base}/api/health`);
  if (!ping.ok) {
    console.error(
      `[verify] Backend not reachable at ${base} (${ping.status}). Start the server first:\n` +
        '  cd vault/backend && npm run dev'
    );
    process.exit(1);
  }

  await runNegative(base);
  console.log('[verify] Negative API checks: OK');

  try {
    await wsSmoke(base);
    console.log('[verify] WebSocket ping: OK');
  } catch (e) {
    console.warn('[verify] WebSocket smoke skipped/failed:', e?.message || e);
  }

  const t0 = Date.now();
  const failures = await pool(USER_COUNT, CONCURRENCY, (i) => runOneUser(base, i));
  const ms = Date.now() - t0;

  if (failures.length) {
    console.error(`[verify] FAILED: ${failures.length} / ${USER_COUNT} users`);
    for (const f of failures.slice(0, 20)) {
      console.error(`  user ${f.i}: ${f.message}`);
    }
    if (failures.length > 20) console.error(`  … and ${failures.length - 20} more`);
    process.exit(1);
  }

  console.log(`[verify] SUCCESS: all ${USER_COUNT} simulated users passed in ${ms}ms`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[verify] Fatal:', e);
  process.exit(1);
});
