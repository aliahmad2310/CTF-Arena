/**
 * CTF Arena - API HTTP Client Wrapper
 * File: frontend/js/api.js
 * Automatically attaches Supabase Bearer token, handles error codes, and formats queries.
 * Strictly zero emoji.
 */

import { CONFIG } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { showToast } from "./ui.js";

const PUBLIC_CACHE_TTL_MS = 20_000;
const PUBLIC_CACHE_STORAGE_PREFIX = "ctf-arena-public-api:";
const publicGetCache = new Map();

function isCacheablePublicGet(path, options) {
  const method = (options.method || "GET").toUpperCase();
  const pathname = path.split("?", 1)[0];
  const publicLeaderboard = pathname === "/leaderboard/teams"
      || pathname === "/leaderboard/users"
      || pathname === "/leaderboard/timeline";
  const anonymousPublicData = (pathname === "/rooms" || pathname === "/ctf/status")
    && !new Headers(options.headers || {}).has("Authorization");
  return method === "GET" && (publicLeaderboard || anonymousPublicData);
}

function readPublicCache(url) {
  const memoryEntry = publicGetCache.get(url);
  if (memoryEntry && memoryEntry.expiresAt > Date.now()) return memoryEntry;
  if (memoryEntry) publicGetCache.delete(url);

  try {
    const stored = sessionStorage.getItem(`${PUBLIC_CACHE_STORAGE_PREFIX}${url}`);
    if (!stored) return null;
    const entry = JSON.parse(stored);
    if (entry.expiresAt <= Date.now()) {
      sessionStorage.removeItem(`${PUBLIC_CACHE_STORAGE_PREFIX}${url}`);
      return null;
    }
    publicGetCache.set(url, entry);
    return entry;
  } catch {
    return null;
  }
}

function writePublicCache(url, value) {
  const entry = { value, expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS };
  publicGetCache.set(url, entry);
  try {
    sessionStorage.setItem(`${PUBLIC_CACHE_STORAGE_PREFIX}${url}`, JSON.stringify(entry));
  } catch {
    // Storage can be disabled or full; the in-memory cache remains available.
  }
}

function invalidatePublicGetCache() {
  publicGetCache.clear();
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PUBLIC_CACHE_STORAGE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Cache invalidation in memory still applies when session storage is unavailable.
  }
}

/**
 * Executes an HTTP request against the FastAPI backend with Bearer JWT authentication.
 * @param {string} endpoint
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  const { suppressAuthErrors = false, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers || {});

  // Retrieve current active session token from Supabase client
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch (err) {
    console.warn("Could not retrieve active auth session for API call:", err);
  }

  // Set default content type if payload present and not multipart/form-data
  if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const config = {
    ...requestOptions,
    headers
  };

  const cacheable = isCacheablePublicGet(endpoint, config);
  if (cacheable) {
    const cached = readPublicCache(url);
    if (cached) return cached.value;
  }

  const fetchPromise = fetch(url, config);

  let response;
  try {
    response = await fetchPromise;
  } catch (netErr) {
    showToast("Network connection error. Is the backend server running?", "error");
    throw new Error(`Network error: ${netErr.message}`);
  }

  // Handle HTTP Status Codes
  if (response.status === 401) {
    if (!suppressAuthErrors) showToast("Session expired or unauthorized. Please log in again.", "error");
    // page sees the stale session and immediately sends the user back here.
    const isAuthPage = /\/login(?:\.html)?\/?$/.test(window.location.pathname);
    if (!isAuthPage) {
      const returnTo = window.location.pathname + window.location.search;
      void supabase.auth.signOut({ scope: "local" }).finally(() => {
        window.location.replace(`/login.html?redirect=${encodeURIComponent(returnTo)}`);
      });
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || "Unauthorized");
  }

  if (response.status === 403) {
    const errData = await response.json().catch(() => ({}));
    const message = errData.detail || "Access forbidden. Insufficient permissions.";
    if (!suppressAuthErrors) showToast(message, "error");
    throw new Error(message);
  }

  if (response.status === 429) {
    showToast("Rate limit exceeded. Please wait a moment before trying again.", "error");
    throw new Error("Too Many Requests");
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const message = typeof errData.detail === "string"
      ? errData.detail
      : errData.detail?.[0]?.msg || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  // Check if content is JSON
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (cacheable && response.ok) {
      writePublicCache(url, data);
    }
    return data;
  }

  return response;
}

export const api = {
  get: (path, params, options = {}) => {
    let url = path;
    if (params) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          search.append(key, String(val));
        }
      });
      const qs = search.toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }
    return apiFetch(url, { ...options, method: "GET" });
  },

  post: async (path, body, options = {}) => {
    const result = await apiFetch(path, {
      ...options,
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
    invalidatePublicGetCache();
    return result;
  },

  patch: async (path, body) => {
    const result = await apiFetch(path, {
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
    invalidatePublicGetCache();
    return result;
  },

  put: async (path, body) => {
    const result = await apiFetch(path, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
    invalidatePublicGetCache();
    return result;
  },

  delete: async (path) => {
    const result = await apiFetch(path, { method: "DELETE" });
    invalidatePublicGetCache();
    return result;
  },

  download: async (path, filename) => {
    const response = await apiFetch(path, { method: "GET" });
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename || "download.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  }
};
