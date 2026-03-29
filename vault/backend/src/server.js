import express from 'express';
import cors from 'cors';
import expressWs from 'express-ws';
import http from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb, getDb } from './models/db.js';
import { sessionsRouter } from './routes/sessions.js';
import { tracksRouter } from './routes/tracks.js';
import { engineRouter } from './routes/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultRoot = path.join(__dirname, '../..');
const BACKEND_PORT_FILE = path.join(vaultRoot, '.vault-backend-port');
const PREFERRED_PORT = Number(process.env.PORT) || 3001;
const MAX_PORT_TRIES = 40;

function writeBackendPortFile(port) {
  try {
    fs.writeFileSync(BACKEND_PORT_FILE, String(port), 'utf8');
  } catch (e) {
    console.warn('[server] Could not write .vault-backend-port:', e.message);
  }
}

function clearBackendPortFile() {
  try {
    if (fs.existsSync(BACKEND_PORT_FILE)) fs.unlinkSync(BACKEND_PORT_FILE);
  } catch (_) {}
}

/**
 * Find first free port starting at preferredPort (probe-only; avoids express-ws / ws.Server
 * receiving EADDRINUSE from the real HTTP server, which Node does not reliably recover from).
 */
function findFirstFreePort(preferredPort) {
  return new Promise((resolve, reject) => {
    let port = preferredPort;

    const probe = () => {
      if (port >= preferredPort + MAX_PORT_TRIES) {
        reject(new Error(`No free TCP port between ${preferredPort} and ${preferredPort + MAX_PORT_TRIES - 1}`));
        return;
      }
      const tester = net.createServer();
      const onErr = (err) => {
        tester.removeListener('error', onErr);
        if (err.code === 'EADDRINUSE') {
          port += 1;
          probe();
        } else {
          reject(err);
        }
      };
      tester.once('error', onErr);
      tester.listen(port, () => {
        tester.removeListener('error', onErr);
        tester.close((closeErr) => {
          if (closeErr) reject(closeErr);
          else resolve(port);
        });
      });
    };

    probe();
  });
}

function listenHttpServer(server, port) {
  return new Promise((resolve, reject) => {
    const onErr = (err) => {
      server.removeListener('error', onErr);
      reject(err);
    };
    server.once('error', onErr);
    server.listen(port, () => {
      server.removeListener('error', onErr);
      resolve();
    });
  });
}

const app = express();
const server = http.createServer(app);
expressWs(app, server);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '4mb' }));

app.use(async (_req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    res.status(503).json({ error: err.message || 'Database unavailable', code: 'DB_INIT' });
  }
});

app.get('/api/health', (_req, res) => {
  try {
    getDb();
    res.json({ ok: true, service: 'vault-backend', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.use('/api/sessions', sessionsRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/engine', engineRouter);

app.ws('/api/ws', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', ok: true, service: 'vault' }));
  ws.on('message', (raw) => {
    try {
      const text = typeof raw === 'string' ? raw : raw?.toString?.() || '';
      if (text.length > 2048) {
        ws.send(JSON.stringify({ type: 'error', ok: false, message: 'Message too large' }));
        return;
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        ws.send(JSON.stringify({ type: 'error', ok: false, message: 'JSON only' }));
        return;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        ws.send(JSON.stringify({ type: 'error', ok: false, message: 'Invalid payload' }));
        return;
      }
      const t = payload.type;
      if (t === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ok: true, t: Date.now() }));
        return;
      }
      if (t === 'status') {
        ws.send(JSON.stringify({ type: 'status', ok: true, backend: 'ready' }));
        return;
      }
      ws.send(JSON.stringify({ type: 'error', ok: false, message: 'Unknown type' }));
    } catch (_) {
      try {
        ws.send(JSON.stringify({ type: 'error', ok: false, message: 'Bad request' }));
      } catch {
        /* */
      }
    }
  });
});

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'SERVER_ERROR',
  });
});

async function start() {
  try {
    await initDb();
    const dataRoot = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataRoot)) fs.mkdirSync(dataRoot, { recursive: true });
    const port = await findFirstFreePort(PREFERRED_PORT);
    await listenHttpServer(server, port);
    writeBackendPortFile(port);
    if (port !== PREFERRED_PORT) {
      console.log(
        `[server] Port ${PREFERRED_PORT} was busy; using http://localhost:${port} (set PORT=${port} or restart the other process if you need a fixed port).`
      );
    }
    console.log(`Rap Factory backend listening on http://localhost:${port}`);
    const shutdown = () => {
      clearBackendPortFile();
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', clearBackendPortFile);
  } catch (err) {
    console.error('Failed to initialize:', err);
    clearBackendPortFile();
    process.exit(1);
  }
}

start();
