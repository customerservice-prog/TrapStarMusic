/** Lets Settings (and others) clear Studio’s decoded vocal buffers without sharing React tree. */

/** @type {import('react').MutableRefObject<Record<string, unknown>> | null} */
let cacheRef = null;

export function registerVocalDecodeCache(ref) {
  cacheRef = ref;
}

export function clearVocalDecodeCacheGlobal() {
  if (cacheRef?.current && typeof cacheRef.current === 'object') {
    for (const k of Object.keys(cacheRef.current)) {
      delete cacheRef.current[k];
    }
  }
}
