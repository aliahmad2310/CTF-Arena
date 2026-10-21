/**
 * CTF Arena - Authentication & Authorization State
 * File: frontend/js/auth.js
 * Handles session tokens, route guards (requireAuth, requireAdmin), and heartbeat loop.
 * Strictly zero emoji.
 */

import { supabase } from "./supabaseClient.js";
import { api } from "./api.js";
import { showToast } from "./ui.js";
import { CONFIG } from "./config.js";

let cachedProfile = null;
let heartbeatTimer = null;

/**
 * Returns the current active Supabase session.
 * @returns {Promise<import("@supabase/supabase-js").Session|null>}
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

/**
 * Fetches the verified user profile from FastAPI backend /me.
 * @param {boolean} forceRefresh
 * @returns {Promise<Object|null>}
 */
export async function getUserProfile(forceRefresh = false, silent = false) {
  if (cachedProfile && !forceRefresh) return cachedProfile;

  const session = await getSession();
  if (!session) {
    cachedProfile = null;
    return null;
  }

  try {
    const profile = await api.get("/me", undefined, silent ? { suppressAuthErrors: true } : undefined);
    cachedProfile = profile;
    return profile;
  } catch (err) {
    if (!silent) console.error("Failed to load user profile:", err);
    return null;
  }
}

/**
 * Route guard: Enforces that the visitor is authenticated.
 * If not authenticated, redirects to /login.html.
 * @returns {Promise<Object>}
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/login.html?redirect=${encodeURIComponent(currentPath)}`;
    throw new Error("Authentication required");
  }

  const profile = await getUserProfile();
  if (!profile) {
    // A valid Supabase session does not guarantee the API is reachable or that
    // the profile request succeeded. Sending the user to login in this case
    // creates a login -> dashboard -> login redirect loop.
    showToast("Your session is active, but your profile could not be verified. Check the API connection and try again.", "error", 8000);
    throw new Error("Profile retrieval failed");
  }

  return profile;
}

/**
 * Route guard: Enforces that the user has role = 'admin'.
 * If regular user, redirects to the root dashboard.
 * @returns {Promise<Object>}
 */
export async function requireAdmin() {
  const profile = await requireAuth();
  if (profile.role !== "admin") {
    showToast("Access restricted: Administrator rights required", "error");
    setTimeout(() => {
      window.location.href = "/";
    }, 1200);
    throw new Error("Admin privileges required");
  }
  return profile;
}

/**
 * Signs the competitor out of the session.
 */
export async function signOut() {
  stopHeartbeat();
  cachedProfile = null;
  await supabase.auth.signOut();
  window.location.href = "/login.html";
}

/**
 * Starts the heartbeat sender loop that pings POST /me/heartbeat every 60s
 * while the page tab is visible.
 * @param {() => string|null} [getRoomId]
 * @param {() => string|null} [getChallengeId]
 */
export function startHeartbeat(getRoomId, getChallengeId) {
  stopHeartbeat();

  const sendHeartbeat = async () => {
    if (document.hidden) return; // Only ping when tab is visible
    const session = await getSession();
    if (!session) return;

    const roomId = getRoomId ? getRoomId() : null;
    const challengeId = getChallengeId ? getChallengeId() : null;

    try {
      await api.post("/me/heartbeat", {
        current_room_id: roomId,
        current_challenge_id: challengeId
      });
    } catch (err) {
      // Suppress heartbeat errors to prevent disruptive toasts
      console.debug("Heartbeat ping failed:", err);
    }
  };

  // Immediate initial heartbeat ping
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, CONFIG.HEARTBEAT_INTERVAL_MS || 60000);
}

/**
 * Halts active heartbeat intervals.
 */
export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
