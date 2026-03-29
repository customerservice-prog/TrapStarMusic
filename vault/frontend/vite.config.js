import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vaultRoot = path.join(__dirname, '..');

function readBackendProxyTarget() {
  const portFile = path.join(vaultRoot, '.vault-backend-port');
  try {
    const raw = fs.readFileSync(portFile, 'utf8').trim();
    const port = parseInt(raw, 10);
    if (Number.isFinite(port) && port > 0 && port < 65536) {
      return `http://localhost:${port}`;
    }
  } catch {
    /* no file yet or unreadable — fall back below */
  }
  const fromEnv = process.env.VAULT_BACKEND_PORT || process.env.BACKEND_PORT;
  if (fromEnv) {
    const port = parseInt(String(fromEnv), 10);
    if (Number.isFinite(port)) return `http://localhost:${port}`;
  }
  return 'http://localhost:3001';
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: readBackendProxyTarget(),
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
