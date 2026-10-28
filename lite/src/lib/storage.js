// Keys live in memory by default. They are written to this browser's
// localStorage only if the user ticks "Remember on this device".
// Nothing is ever sent to any server except the API the key belongs to.

const STORE_KEY = "kol_discover_lite_keys_v1";

export const EMPTY_KEYS = { openalexKey: "", email: "", geminiKey: "", remember: false };

export function loadSavedKeys() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...EMPTY_KEYS };
    const parsed = JSON.parse(raw);
    return { ...EMPTY_KEYS, ...parsed, remember: true };
  } catch {
    return { ...EMPTY_KEYS };
  }
}

export function persistKeys(keys) {
  try {
    if (keys.remember) {
      const { openalexKey, email, geminiKey } = keys;
      localStorage.setItem(STORE_KEY, JSON.stringify({ openalexKey, email, geminiKey }));
    } else {
      localStorage.removeItem(STORE_KEY);
    }
  } catch {
    // Storage unavailable (private window etc.). Keys stay in memory only.
  }
}

export function forgetKeys() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
