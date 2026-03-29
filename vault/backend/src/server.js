import express from 'express';
import cors from 'cors';
import expressWs from 'express-ws';
import http from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb } from './models/db.js';
import { env } from './config/env.js';
import { ensureDataTree } from './services/storageService.js';
import { sessionsRouter } from './routes/sessions.js';
import { tracksRouter } from './routes/tracks.js';
import { engineRouter } from './routes/engine.js';
import { adminRouter } from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { attachLocalUser } from './middleware/attachLocalUser.js';
import * as healthController from './controllers/healthController.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultRoot = path.join(__dirname, '../..');
const BACKEND_PORT_FILE = path.join(vaultRoot, '.vault-backend-port');
const PREFERRED_PORT = env.port;
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
app.use(attachLocalUser);

app.use(async (_req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: { code: 'DB_INIT', message: err.message || 'Database unavailable' },
    });
  }
});

app.get('/api/health', healthController.health);

app.use('/api/sessions', sessionsRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/engine', engineRouter);
app.use('/api/admin', adminRouter);

app.ws('/api/ws', (ws) => {
    ws.send(JSON.stringify({ type: 'hello', ok: true, service: 'rap-factory-backend' }));
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

app.use(errorHandler);

async function start() {
  try {
    await initDb();
    ensureDataTree();
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
