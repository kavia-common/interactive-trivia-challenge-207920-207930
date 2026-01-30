/**
 * Lightweight fetch wrapper for the trivia backend.
 * - Handles JSON parsing, non-2xx errors, aborts, and timeouts.
 * - Uses REACT_APP_TRIVIA_API_BASE_URL when provided, otherwise falls back to same-origin "/api".
 */

const DEFAULT_TIMEOUT_MS = 15000;

// PUBLIC_INTERFACE
export function getApiBaseUrl() {
  /** Returns the configured API base URL for the backend. */
  const envUrl = process.env.REACT_APP_TRIVIA_API_BASE_URL;
  return (envUrl && envUrl.trim()) ? envUrl.trim().replace(/\/$/, "") : "/api";
}

function toErrorMessage(payload) {
  if (!payload) return "Request failed";
  if (typeof payload === "string") return payload;
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) return payload.detail.map((d) => d?.msg || "Invalid request").join(", ");
  return "Request failed";
}

async function parseJsonSafe(resp) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

// PUBLIC_INTERFACE
export async function apiRequest(path, { method = "GET", body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  /**
   * Perform an API request to the trivia backend.
   * @param {string} path - Path starting with "/". Example: "/game/start"
   * @param {object} options - fetch options
   * @returns {Promise<any>} parsed JSON (or null)
   */
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);

  const mergedSignal = signal
    ? new AbortSignal.any([signal, controller.signal])
    : controller.signal;

  const init = {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    signal: mergedSignal,
  };

  if (body !== undefined) init.body = JSON.stringify(body);

  try {
    const resp = await fetch(url, init);
    const payload = await parseJsonSafe(resp);

    if (!resp.ok) {
      const msg = toErrorMessage(payload) || `HTTP ${resp.status}`;
      const err = new Error(msg);
      err.status = resp.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
