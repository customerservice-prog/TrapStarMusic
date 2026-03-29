import path from 'path';
import fs from 'fs';

/**
 * Resolve a stored relative path under baseDir; blocks traversal and null bytes.
 * @returns {string|null} absolute path or null if unsafe / missing
 */
export function resolveUnderDir(baseDir, relative) {
  if (relative == null || typeof relative !== 'string') return null;
  const norm = relative.replace(/\\/g, '/').replace(/^\//, '').trim();
  if (!norm || norm.includes('\0') || norm.includes('..')) return null;
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, norm);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

export function assertFileExists(absPath) {
  if (!absPath || !fs.existsSync(absPath)) return false;
  try {
    const st = fs.statSync(absPath);
    return st.isFile();
  } catch {
    return false;
  }
}

/** Stored take filenames are UUID + allowed extension only */
export function isSafeTakeFilename(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 200) return false;
  return /^[0-9a-f-]{36}\.(webm|wav|mp3|ogg|m4a)$/i.test(name);
}
