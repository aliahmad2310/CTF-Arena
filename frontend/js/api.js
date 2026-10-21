/**
 * CTF Arena - API HTTP Client Wrapper
 * File: frontend/js/api.js
 * Automatically attaches Supabase Bearer token, handles error codes, and formats queries.
 * Strictly zero emoji.
 */

import { CONFIG } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { showToast } from "./ui.js";

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

  let response;
  try {
    response = await fetch(url, config);
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
    const message = errData.detail || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  // Check if content is JSON
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
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

  post: (path, body, options = {}) => apiFetch(path, {
    ...options,
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),

  patch: (path, body) => apiFetch(path, {
    method: "PATCH",
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),

  put: (path, body) => apiFetch(path, {
    method: "PUT",
    body: body instanceof FormData ? body : JSON.stringify(body)
  }),

  delete: (path) => apiFetch(path, { method: "DELETE" }),

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
