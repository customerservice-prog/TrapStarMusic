import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Backend package root (RAP FACTORY app): vault/backend */
const backendRoot = path.join(__dirname, '../..');
/** Monorepo vault folder (contains data/, frontend/) */
const vaultRoot = path.join(backendRoot, '..');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3001,
  /** When true, stack traces are never sent to clients (errorHandler still logs). */
  hideErrorDetails: process.env.NODE_ENV === 'production',
  /** Optional admin API key (Bearer or x-admin-key). If unset, admin routes stay disabled. */
  adminApiKey: process.env.RAPFACTORY_ADMIN_KEY || process.env.VAULT_ADMIN_KEY || '',
  paths: {
    backendRoot,
    vaultRoot,
    dataDir: path.join(vaultRoot, 'data'),
    beatsDir: path.join(vaultRoot, 'data', 'beats'),
    tracksDir: path.join(vaultRoot, 'data', 'tracks'),
  },
};
