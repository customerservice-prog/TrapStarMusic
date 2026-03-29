const DEBUG = process.env.VAULT_DEBUG === '1' || process.env.VAULT_DEBUG === 'true';

function out(level, msg, ctx) {
  const line = ctx && Object.keys(ctx).length ? `${msg} ${JSON.stringify(ctx)}` : msg;
  if (level === 'error') console.error(`[vault:${level}]`, line);
  else if (level === 'warn') console.warn(`[vault:${level}]`, line);
  else if (DEBUG || level === 'info') console.log(`[vault:${level}]`, line);
}

export const log = {
  debug: (msg, ctx) => DEBUG && out('debug', msg, ctx),
  info: (msg, ctx) => out('info', msg, ctx),
  warn: (msg, ctx) => out('warn', msg, ctx),
  error: (msg, ctx) => out('error', msg, ctx),
};
